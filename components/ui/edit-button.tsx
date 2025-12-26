'use client';

import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';

interface EditButtonProps {
    onClick: () => void;
}

export function EditButton({ onClick }: EditButtonProps) {
    return (
        <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10"
            onClick={onClick}
        >
            <Pencil className="h-4 w-4" />
        </Button>
    );
}
