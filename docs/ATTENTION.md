# Attention System Architecture

## Overview

The attention system manages what the agent focuses on and guides memory retrieval based on urgency and current focus. It's inspired by human brain attention mechanisms with multiple subsystems working together.

## Architecture Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    ATTENTION SYSTEM STRUCTURE                    │
└─────────────────────────────────────────────────────────────────┘

core/attention/
├── types.ts                    # Core type definitions
│
├── alerting/                   # Alerting System - Urgency detection
│   ├── urgency-detector.ts     # Detects urgency levels
│   └── readiness.ts           # Maintains alertness state
│
├── orienting/                  # Orienting System - What to attend to
│   ├── analyzer.ts            # Analyzes topic/task/focus level
│   └── direction.ts           # Directs attention to stimuli
│
├── sustained/                 # Sustained Attention - Focus tracking
│   ├── focus-tracker.ts        # Maintains focus state over time
│   └── continuity.ts          # Focus continuity & strength
│
├── selective/                 # Selective Attention - Filtering
│   ├── filter.ts              # Creates filter criteria
│   └── relevance.ts           # Scores relevance to focus
│
└── executive/                 # Executive Attention - Coordination
    ├── controller.ts          # Main orchestrator
    └── allocation.ts          # Resource allocation decisions
```

## Data Flow

```
User Message
  ↓
alerting/urgency-detector → Detect urgency (low/medium/high/critical)
  ↓
orienting/analyzer → Determine topic, task, focus level
  ↓
executive/controller → Coordinate subsystems
  ↓
sustained/focus-tracker → Update focus state
  ↓
executive/allocation → Make memory retrieval decisions
  ↓
Memory Manager → Retrieve memories based on attention plan
```

## Terms

### Alerting System
**Purpose**: Detects urgency and maintains readiness

- **Urgency Levels**: `low`, `medium`, `high`, `critical`
- **Readiness**: Alertness state (0-1) based on urgency
- **Function**: Determines how much attention/resources to allocate

### Orienting System
**Purpose**: Determines what to attend to

- **Topic**: Main focus (2-5 words)
- **Task**: Active goal/task (if any)
- **Focus Level**: `narrow` (specific) or `broad` (exploratory)
- **Continuation**: Whether message continues previous focus

### Sustained Attention
**Purpose**: Maintains focus over time

- **Focus State**: Current topic, task, urgency, turn count
- **Focus Strength**: Calculated from turn count + urgency
- **Continuity**: Tracks if focus is maintained across turns

### Selective Attention
**Purpose**: Filters relevant information

- **Relevance Score**: 0-1 score for information relevance
- **Filter Criteria**: Topic, task, minimum relevance threshold
- **Function**: Suppresses noise, highlights relevant info

### Executive Attention
**Purpose**: Coordinates all subsystems

- **Controller**: Main orchestrator processing messages
- **Allocation**: Decides memory types and limits based on urgency
- **Integration**: Connects attention to memory retrieval

## Focus State

Per-agent focus tracking (not per-conversation):

```typescript
{
  agentId: string;
  currentTopic: string;        // What we're focused on
  currentTask?: string;        // Active task/goal
  urgency: UrgencyLevel;       // Current urgency
  focusLevel: FocusLevel;       // narrow or broad
  turnCount: number;           // How many turns in this focus
  lastUpdated: number;         // Timestamp
}
```

## Urgency → Memory Mapping

| Urgency | Memory Limit | Memory Types |
|---------|-------------|--------------|
| `critical` | 20 | All types |
| `high` | 12 | semantic, episodic, procedural |
| `medium` | 8 | semantic, episodic |
| `low` | 4 | semantic |

## Integration

The attention system integrates with the awareness runtime:

1. **Before memory retrieval**: Processes message through attention subsystems
2. **Memory guidance**: Uses allocation decisions to determine what memories to retrieve
3. **Focus persistence**: Maintains focus state across conversations for the agent
4. **Fallback**: Defaults to standard memory retrieval if attention fails
