/**
 * Browser snapshot extraction logic
 * Extracts meaningful content from pages (like OpenClaw's approach)
 * This code runs in the browser context via page.evaluate()
 */

export interface SnapshotOptions {
  selector: string | null;
  interactiveOnly: boolean;
  maxChars: number;
}

export interface SnapshotElement {
  ref: number;
  role: string;
  tag: string;
  text?: string;
  label?: string;
  type?: string;
  value?: string;
  href?: string;
  checked?: boolean;
  selected?: boolean;
  placeholder?: string;
  visible: boolean;
}

export interface SnapshotResult {
  snapshot: string;
  elements: SnapshotElement[];
  stats: {
    total: number;
    interactive: number;
  };
}

export interface SnapshotError {
  error: string;
}

/**
 * JavaScript code that runs in browser context to extract meaningful content
 * This is passed to page.evaluate() as a string
 */
export const extractSnapshotCode = `
(options) => {
  const { selector, interactiveOnly, maxChars } = options;
  
  // Get root element (scoped or full page)
  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) {
    return { error: \`Selector "\${selector}" not found\` };
  }

  const elements = [];
  let refCounter = 0;
  let interactiveCount = 0;

  // Helper to check if element is visible
  const isVisible = (el) => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // Helper to get meaningful text content
  const getTextContent = (el, maxLength) => {
    // Get direct text (not from children)
    let text = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || "";
      }
    }
    text = text.trim();
    
    // If no direct text, try aria-label or title
    if (!text) {
      text = el.getAttribute("aria-label") || el.getAttribute("title") || "";
    }
    
    // For headings and paragraphs, get full text content
    const tag = el.tagName.toLowerCase();
    if (["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "td", "th"].includes(tag)) {
      text = el.textContent?.trim() || text;
    }
    
    if (!text) return undefined;
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  };

  // Helper to check if element is interactive
  const isInteractive = (el) => {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    
    // Interactive tags
    if (["button", "input", "select", "textarea", "a"].includes(tag)) {
      return true;
    }
    
    // Interactive roles
    if (role && ["button", "link", "checkbox", "radio", "textbox", "combobox", "menuitem", "tab"].includes(role)) {
      return true;
    }
    
    // Elements with click handlers or tabindex
    if (el.hasAttribute("onclick") || el.hasAttribute("tabindex")) {
      return true;
    }
    
    return false;
  };

  // Walk the DOM tree
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const el = node;
        
        // Skip script, style, meta, etc.
        const tag = el.tagName.toLowerCase();
        if (["script", "style", "meta", "link", "noscript", "svg", "path"].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // If interactive only, skip non-interactive elements
        if (interactiveOnly && !isInteractive(el)) {
          // But still check children
          return NodeFilter.FILTER_SKIP;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let node;
  while ((node = walker.nextNode())) {
    const el = node;
    
    // Skip if not visible
    if (!isVisible(el)) {
      continue;
    }
    
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || tag;
    const text = getTextContent(el, maxChars);
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || undefined;
    
    // Only include elements with meaningful content or interactive elements
    if (!text && !label && !isInteractive(el)) {
      continue;
    }
    
    // Skip empty divs/spans unless they're interactive
    const isElInteractive = isInteractive(el);
    if ((tag === "div" || tag === "span") && !text && !label && !isElInteractive) {
      continue;
    }

    if (isElInteractive) {
      interactiveCount++;
    }

    const element = {
      ref: refCounter++,
      role,
      tag,
      visible: true,
    };

    if (text) element.text = text;
    if (label) element.label = label;

    // Add interactive element properties
    if (tag === "a") {
      element.href = el.href || undefined;
    }
    if (tag === "input") {
      element.type = el.type;
      element.value = el.value || undefined;
      element.placeholder = el.placeholder || undefined;
      if (el.type === "checkbox" || el.type === "radio") {
        element.checked = el.checked;
      }
    }
    if (tag === "select") {
      element.selected = el.selectedIndex !== -1;
      if (el.selectedIndex >= 0) {
        element.value = el.options[el.selectedIndex].text;
      }
    }
    if (tag === "textarea") {
      element.value = el.value || undefined;
      element.placeholder = el.placeholder || undefined;
    }

    elements.push(element);
  }

  // Build compact text representation
  const lines = [];
  for (const el of elements) {
    let line = \`[\${el.ref}] <\${el.tag}>\`;
    if (el.role !== el.tag) {
      line += \` role="\${el.role}"\`;
    }
    if (el.label) {
      line += \` label="\${el.label}"\`;
    }
    if (el.text) {
      line += \` "\${el.text}"\`;
    }
    if (el.href) {
      line += \` href="\${el.href}"\`;
    }
    if (el.type) {
      line += \` type="\${el.type}"\`;
    }
    if (el.value !== undefined) {
      line += \` value="\${String(el.value).substring(0, 50)}"\`;
    }
    if (el.checked !== undefined) {
      line += \` checked=\${el.checked}\`;
    }
    if (el.selected !== undefined) {
      line += \` selected=\${el.selected}\`;
    }
    lines.push(line);
  }

  return {
    snapshot: lines.join("\\n"),
    elements,
    stats: {
      total: elements.length,
      interactive: interactiveCount,
    },
  };
}
`;

/**
 * Helper function to create the evaluation function
 */
export function createSnapshotExtractor(options: SnapshotOptions): string {
  return `(${extractSnapshotCode})(${JSON.stringify(options)})`;
}
