import React, { useState, useEffect } from 'react';

interface EditTeamNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newName: string) => Promise<void>;
  currentName: string;
  teamCode: string;
}

export default function EditTeamNameModal({
  isOpen,
  onClose,
  onSave,
  currentName,
  teamCode
}: EditTeamNameModalProps) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSaving(true);
      await onSave(name);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[4px] p-4 animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md rounded-[var(--lg-radius-2xl)] bg-[var(--lg-glass-bg)] backdrop-blur-[var(--lg-glass-blur)] border border-[var(--lg-glass-border)] shadow-[var(--lg-glass-shadow)] p-8 animate-in zoom-in-95 duration-200"
      >
        <div className="mb-6">
          <h3 className="text-2xl font-bold tracking-tight text-[var(--lg-text-heading)]">
            Rename Team
          </h3>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mt-1 opacity-60">Team: {teamCode}</p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-8">
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">
              New Team Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="lg-input w-full"
              autoFocus
              placeholder="Enter team name..."
            />
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="lg-button-secondary px-6 py-2"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="lg-button-primary px-8 py-2"
              disabled={saving || !name.trim()}
            >
              {saving ? 'Processing...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
