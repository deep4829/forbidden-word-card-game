'use client';

import { useState } from 'react';
import { AVATARS } from '@/lib/avatars';
import type { Player } from '@/types/game';

interface EditProfileModalProps {
  player: Player;
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, avatar: string) => void;
}

export default function EditProfileModal({
  player,
  isOpen,
  onClose,
  onSave,
}: EditProfileModalProps) {
  const [editName, setEditName] = useState(player.name);
  const [editAvatar, setEditAvatar] = useState(player.avatar || '🎮');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!editName.trim()) {
      alert('Name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      onSave(editName.trim(), editAvatar);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setEditName(player.name);
    setEditAvatar(player.avatar || '🎮');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in fade-in zoom-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Edit Profile</h2>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-gray-500 hover:text-gray-700 text-2xl disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Name Input */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Player Name
          </label>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={isSaving}
            maxLength={20}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500 disabled:bg-gray-100 text-gray-900"
            placeholder="Enter your name"
          />
          <p className="text-xs text-gray-500 mt-1">{editName.length}/20 characters</p>
        </div>

        {/* Current Avatar Display */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Select Avatar
          </label>
          <div className="flex items-center gap-4 mb-4 p-4 bg-indigo-50 rounded-lg border-2 border-indigo-200">
            <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center text-4xl shadow-md">
              {editAvatar}
            </div>
            <div>
              <p className="text-sm text-gray-600">Current Avatar</p>
              <p className="text-lg font-bold text-indigo-600">{editAvatar}</p>
            </div>
          </div>
        </div>

        {/* Avatar Grid */}
        <div className="mb-6">
          <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-50 rounded-lg border border-gray-200">
            {AVATARS.map((avatar, idx) => (
              <button
                key={idx}
                onClick={() => setEditAvatar(avatar)}
                disabled={isSaving}
                className={`p-2 rounded-lg text-2xl transition-all ${
                  editAvatar === avatar
                    ? 'bg-indigo-500 scale-125 shadow-lg'
                    : 'bg-white hover:bg-gray-100 border border-gray-300'
                } disabled:opacity-50 cursor-pointer`}
              >
                {avatar}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
