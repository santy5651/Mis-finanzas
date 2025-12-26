"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface InlineAmountProps {
    value: number;
    currency?: string;
    onSave: (newValue: number) => Promise<void>;
    className?: string;
}

export function InlineAmount({ value, currency = "COP", onSave, className }: InlineAmountProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync local state when prop updates (unless editing)
    useEffect(() => {
        if (!isEditing) {
            setLocalValue(value);
        }
    }, [value, isEditing]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            await handleSave();
        } else if (e.key === "Escape") {
            setLocalValue(value);
            setIsEditing(false);
        }
    };

    const handleSave = async () => {
        if (loading) return;

        // Optimistic update could go here, but we wait for parent
        try {
            setLoading(true);
            // Basic validaton
            if (isNaN(localValue)) {
                setLocalValue(value); // Revert
                setIsEditing(false);
                return;
            }
            if (localValue !== value) {
                await onSave(localValue);
            }
            setIsEditing(false);
        } catch (error) {
            console.error("Failed to save inline amount:", error);
            // Revert on error
            setLocalValue(value);
        } finally {
            setLoading(false);
        }
    };

    if (isEditing) {
        return (
            <Input
                ref={inputRef}
                type="number"
                step="any"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.valueAsNumber)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className={cn("h-8 w-32 text-right", className)}
            />
        );
    }

    return (
        <span
            onClick={() => setIsEditing(true)}
            className={cn(
                "cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded transition-colors border border-transparent hover:border-border",
                className
            )}
            title="Click to edit"
        >
            ${value.toLocaleString()}
            {/* Currency usually redundant if column header says it, but kept if passed explicitly */}
        </span>
    );
}
