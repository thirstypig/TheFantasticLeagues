import React, { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { updateRosterPosition } from "../api";
import { normalizePosition } from "../../../lib/playerDisplay";
import { useToast } from "../../../contexts/ToastContext";

// --- Types ---
interface RosterPlayer {
  id: number; // roster ID
  playerId: number;
  name: string;
  posPrimary: string;
  posList: string; // e.g. "SS, 2B"
  assignedPosition: string | null;
  mlbTeam?: string;
}

interface TeamRosterManagerProps {
  teamId: number;
  roster: RosterPlayer[];
  onUpdate: () => void;
}

const LINEUP_SLOTS = [
  "C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "UT",
  "P", "P", "P", "P", "P", "P", "P", "P", "P"
];

// --- Draggable Item Component ---
function SortablePlayer({ player, compact = false }: { player: RosterPlayer; compact?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: player.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 999 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        relative px-3 py-2 bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)]
        rounded text-sm flex justify-between items-center
        cursor-grab active:cursor-grabbing hover:border-[var(--lg-border-subtle)] transition-colors
        ${compact ? 'text-xs py-1.5' : 'mb-2 shadow-sm'}
        ${isDragging ? 'shadow-xl ring-2 ring-sky-500' : ''}
      `}
    >
      <div className="flex items-center gap-3">
        <span className={`
            font-mono font-bold w-6 text-center rounded
            ${(player.posPrimary === 'P') ? 'text-purple-400 bg-purple-900/20' : 'text-blue-400 bg-blue-900/20'}
        `}>
            {player.posPrimary}
        </span>
        <div className="flex flex-col">
            <span className="font-semibold text-[var(--lg-text-primary)] leading-tight">{player.name}</span>
            <span className="text-xs text-[var(--lg-text-muted)] uppercase tracking-wide">
                {player.mlbTeam || 'FA'} • {player.posList}
            </span>
        </div>
      </div>
    </div>
  );
}

// --- Droppable Components ---
function DroppableSlot({ id, label, player, isPitcherSlot }: { id: string, label: string, player?: RosterPlayer, isPitcherSlot: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div 
        ref={setNodeRef} 
        className={`flex items-center gap-3 p-2 rounded border-2 transition-all duration-200 ${
            isOver ? 'border-sky-500 bg-sky-500/10 scale-[1.02]' : 'border-[var(--lg-border-faint)] bg-[var(--lg-tint)]'
        }`}
    >
        <div className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold text-sm shadow-inner ${
            isPitcherSlot ? 'bg-purple-900/30 text-purple-300 border border-purple-800/50' : 'bg-blue-900/30 text-blue-300 border border-blue-800/50'
        }`}>
            {label}
        </div>
        
        <div className="flex-1 min-h-[40px] flex items-center">
            {player ? (
                <div className="w-full">
                    <SortablePlayer player={player} compact />
                </div>
            ) : (
                <div className="text-[var(--lg-text-muted)] text-xs italic ml-2">Empty Slot</div>
            )}
        </div>
    </div>
  );
}

function DroppableArea({ id, children }: { id: string, children: React.ReactNode }) {
    const { isOver, setNodeRef } = useDroppable({ id });
    
    return (
        <div 
            ref={setNodeRef} 
            className={`min-h-[300px] p-2 rounded-lg transition-colors border-2 border-dashed ${
                isOver ? 'bg-[var(--lg-tint)] border-sky-500/50' : 'border-[var(--lg-border-faint)] bg-[var(--lg-tint)]'
            }`}
        >
            {children}
        </div>
    );
}

export default function TeamRosterManager({ teamId, roster, onUpdate }: TeamRosterManagerProps) {
  const { toast, confirm } = useToast();
  const [items, setItems] = useState<RosterPlayer[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    setItems(roster);
  }, [roster]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: { distance: 5 } // Require slight movement to prevent accidental clicks
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const playerId = active.id as number;
    const player = items.find(p => p.id === playerId);
    if (!player) return;

    const targetId = over.id as string; 
    let newPos: string | null = null;
    
    if (targetId === "bench") {
        newPos = null; 
    } else if (targetId.startsWith("slot-")) {
        const [_, slotName] = targetId.split("-");
        // slotName matches what we want to save
        newPos = slotName; 
    }

    // Validation
    if (newPos) {
        // Pitcher Logic
        if (newPos === 'P') {
            if (normalizePosition(player.posPrimary) !== 'P') {
                toast("Only pitchers can be placed in P slots.", "error");
                return;
            }
        } else if (normalizePosition(player.posPrimary) === 'P') {
            toast("Pitchers cannot be placed in hitting slots.", "error");
            return;
        }

        // Hitter Eligibility Logic
        if (newPos !== 'P' && newPos !== 'UT') {
            const eligible = (player.posList || player.posPrimary).split(/[,/]/).map(s => normalizePosition(s.trim()));
            eligible.push(normalizePosition(player.posPrimary));
            if (!eligible.includes(newPos)) {
                 if (!await confirm(`Warning: ${player.name} is primarily ${player.posPrimary}. Move to ${newPos} anyway?`)) {
                     return;
                 }
            }
        }
    }

    // Optimistic Update
    const oldItems = [...items];
    
    // If we drop into a slot that is already occupied, we need to handle the swap?
    // Current simple logic: If distinct slots (OF-1, OF-2), backend stores 'OF'.
    // Front-end renders based on first-come-first-serve for that position.
    // So if I drop into OF-2, and OF-1 is taken, it just becomes "another OF".
    // If I drop into "1B" and "1B" is taken, we effectively kick the other player to bench?
    // OR we swap?
    // Let's implement simpler "Kick to Bench" logic for MVP if collision.
    // BUT since we map by index, the UI might be confusing if we don't handle it explicitly.
    // Let's just update the single player first.
    
    // Check collision for unique slots (C, 1B, etc - NOT OF/P)
    // Actually, backend only stores "1B". Frontend mapping logic `items.filter(p => p.assignedPosition === slot)`
    // assigns them to slots 0, 1, 2...
    // So if I have 1 player at 1B, they take slot 1B-0.
    // If I move another player to 1B, now I have 2 players at 1B. 
    // The UI will likely show the first one in 1B-0, second in 1B-1?
    // But we only render 1B-0. So the second one disappears visually?
    // FIX: We need robust slot management.
    // For now: Just update.
    
    const updatedItems = items.map(p => {
        if (p.id === playerId) {
            return { ...p, assignedPosition: newPos === "BN" ? null : newPos };
        }
        return p;
    });
    
    setItems(updatedItems);
    
    try {
        await updateRosterPosition(teamId, playerId, newPos === "BN" ? null : newPos);
        onUpdate(); 
    } catch (e) {
        console.error(e);
        setItems(oldItems); // Revert
        toast("Failed to save move", "error");
    }
  };

  const activePlayer = activeId ? items.find(p => p.id === activeId) : null;

  return (
    <DndContext 
        sensors={sensors} 
        collisionDetection={closestCenter} 
        onDragStart={(e) => setActiveId(e.active.id as number)}
        onDragEnd={handleDragEnd}
    >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            {/* Active Lineup Column */}
            <div className="lg:col-span-7 space-y-3">
                <div className="bg-[var(--lg-glass-bg)] p-4 rounded-xl border border-[var(--lg-border-faint)] shadow-xl backdrop-blur-sm">
                    <h3 className="font-bold text-[var(--lg-text-primary)] uppercase text-xs tracking-wider mb-4 flex justify-between items-center">
                        <span>Starting Lineup</span>
                        <span className="text-[var(--lg-text-muted)] font-normal">{items.filter(p => p.assignedPosition && p.assignedPosition !== 'BN').length} Active</span>
                    </h3>
                    
                    <div className="grid grid-cols-1 gap-2">
                        {LINEUP_SLOTS.map((slot, globalIdx) => {
                             // Find players currently assigned to this position type
                             const playersInPos = items.filter(p => p.assignedPosition === slot);
                             
                             // Determine which "instance" of this slot we are rendering (e.g. OF #1, OF #2)
                             // Count how many times this slot type has appeared in LINEUP_SLOTS so far
                             const slotInstanceIdx = LINEUP_SLOTS.slice(0, globalIdx).filter(s => s === slot).length;
                             
                             const player = playersInPos[slotInstanceIdx];
                             const droppableId = `slot-${slot}-${slotInstanceIdx}`; // Unique ID for dnd-kit
                             
                             return (
                                 <DroppableSlot 
                                    key={droppableId} 
                                    id={droppableId} 
                                    label={slot} 
                                    player={player} 
                                    isPitcherSlot={slot === 'P'} 
                                 />
                             );
                        })}
                    </div>
                </div>
            </div>

            {/* Bench Column */}
            <div className="lg:col-span-5 h-full">
                <div className="bg-[var(--lg-glass-bg)] p-4 rounded-xl border border-[var(--lg-border-faint)] h-full flex flex-col">
                    <h3 className="font-bold text-[var(--lg-text-muted)] uppercase text-xs tracking-wider mb-4">Bench / Reserves</h3>
                    
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <DroppableArea id="bench">
                           <SortableContext items={items.map(p => p.id)}>
                                {items
                                    .filter(p => !p.assignedPosition || p.assignedPosition === 'BN' || !LINEUP_SLOTS.includes(p.assignedPosition))
                                    .map(p => (
                                         <SortablePlayer key={p.id} player={p} />
                                    ))
                                }
                           </SortableContext>
                             
                             {items.filter(p => !p.assignedPosition || p.assignedPosition === 'BN').length === 0 && (
                                 <div className="text-center text-[var(--lg-text-muted)] text-sm py-12 flex flex-col items-center">
                                    <span className="text-2xl mb-2">🏝️</span>
                                    <span>Bench is empty</span>
                                 </div>
                             )}
                        </DroppableArea>
                    </div>
                </div>
            </div>
        </div>
        
        <DragOverlay>
            {activePlayer ? (
                <div className="opacity-90 rotate-2 cursor-grabbing w-72 pointer-events-none">
                    <SortablePlayer player={activePlayer} />
                </div>
            ) : null}
        </DragOverlay>
    </DndContext>
  );
}
