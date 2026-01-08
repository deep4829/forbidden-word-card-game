import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
// import { XMarkIcon } from '@heroicons/react/24/solid'; // Assuming we have heroicons or use unicode

interface CustomCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (mainWord: string, forbiddenWords: string[]) => void;
    isSubmitting: boolean;
    socket: any; // Using any for simplicity with socket.io-client
}

export default function CustomCardModal({ isOpen, onClose, onSubmit, isSubmitting, socket }: CustomCardModalProps) {
    const [mainWord, setMainWord] = useState('');
    const [forbiddenWords, setForbiddenWords] = useState<string[]>(['', '', '', '', '']);
    const [error, setError] = useState('');
    const [randomCount, setRandomCount] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (!socket) return;

        const onRandomCard = (data: { mainWord: string, forbiddenWords: string[] }) => {
            setMainWord(data.mainWord);
            setForbiddenWords([...data.forbiddenWords, ...Array(5 - data.forbiddenWords.length).fill('')]);
            setIsGenerating(false);
            setRandomCount((prev: number) => prev + 1);
        };

        socket.on('random-card-data', onRandomCard);
        return () => {
            socket.off('random-card-data', onRandomCard);
        };
    }, [socket]);

    if (!isOpen) return null;

    const handleForbiddenChange = (index: number, value: string) => {
        const newWords = [...forbiddenWords];
        newWords[index] = value;
        setForbiddenWords(newWords);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!mainWord.trim()) {
            setError('Main word is required');
            return;
        }

        const filledForbidden = forbiddenWords.map((w: string) => w.trim()).filter((w: string) => w);
        if (filledForbidden.length < 3) { // Enforce 5? Or fewer OK? Logic usually expects 5 in this game style
            // Let's enforce at least 2 for gameplay, but game usually has 5.
            // User asked "forbbiden word to add", usually implying the set. 
            // Let's require at least 3 to make it challenging.
            setError('Please provide at least 3 forbidden words');
            return;
        }

        onSubmit(mainWord.trim(), filledForbidden);
    };

    const handleRandom = () => {
        if (isGenerating || isSubmitting) return;
        setIsGenerating(true);
        setError('');

        // If clicked more than 2 times, use DB fallback
        const useGemini = randomCount < 2;
        socket.emit('request-random-card', { useGemini });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all scale-100 animate-slideUp overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex items-center justify-between shrink-0">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        ✨ Create Custom Card
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleRandom}
                            disabled={isGenerating || isSubmitting}
                            className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold py-1 px-3 rounded-full transition-all flex items-center gap-1 border border-white/30"
                        >
                            {isGenerating ? (
                                <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                            ) : '🎲'}
                            Random
                        </button>
                        <button
                            onClick={onClose}
                            className="text-white/80 hover:text-white transition-colors bg-white/10 hover:bg-white/20 rounded-full p-1"
                            disabled={isSubmitting}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* content */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Main Word */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">
                                Target Word
                            </label>
                            <input
                                type="text"
                                value={mainWord}
                                onChange={(e) => setMainWord(e.target.value)}
                                placeholder="e.g. Apple"
                                className="w-full px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-lg text-gray-800"
                                disabled={isSubmitting}
                            />
                        </div>

                        {/* Forbidden Words */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                Forbidden Words
                            </label>
                            <div className="space-y-2">
                                {forbiddenWords.map((word, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="text-gray-400 font-bold text-sm w-4">{idx + 1}.</span>
                                        <input
                                            type="text"
                                            value={word}
                                            onChange={(e) => handleForbiddenChange(idx, e.target.value)}
                                            placeholder={`Forbidden word ${idx + 1}`}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-red-400 focus:ring-2 focus:ring-red-50 outline-none transition-all text-gray-800"
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={(e: React.FormEvent) => handleSubmit(e)}
                        disabled={isSubmitting}
                        className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg hover:shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:transform-none flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Creating...
                            </>
                        ) : (
                            'Create Card'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
