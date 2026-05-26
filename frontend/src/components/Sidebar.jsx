import React, { useState, useRef, useEffect } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiPlus, FiLayout, FiEdit2, FiTrash2, FiMessageSquare, FiBarChart2, FiGlobe } = FiIcons;

const FIXED_ICONS = {
  chat: FiMessageSquare,
  dashboard: FiBarChart2,
};

export default function Sidebar({ fixedTabs, dynamicTabs, activeTabId, onSelect, onAdd, onRename, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEdit = (tab, e) => {
    e.stopPropagation();
    setEditingId(tab.id);
    setEditValue(tab.name);
  };

  const handleSaveEdit = () => {
    if (editValue.trim() && editingId) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveEdit();
    if (e.key === 'Escape') setEditingId(null);
  };

  const renderTab = (tab, isFixed) => {
    const isActive = activeTabId === tab.id;
    const Icon = isFixed ? FIXED_ICONS[tab.id] : FiGlobe;

    return (
      <div
        key={tab.id}
        onClick={() => onSelect(tab.id)}
        className={`
          group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200
          ${isActive
            ? 'bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-600/20'
            : 'hover:bg-white/5 hover:text-white'}
        `}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
          <SafeIcon icon={Icon} className={`text-sm shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
          <div className="flex-1 min-w-0">
            {!isFixed && editingId === tab.id ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={handleKeyDown}
                className="w-full bg-black/20 text-white px-2 py-0.5 rounded border border-white/20 focus:outline-none text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="block truncate text-sm select-none">
                {tab.name}
              </span>
            )}
          </div>
        </div>

        {!isFixed && editingId !== tab.id && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => startEdit(tab, e)}
              className={`p-1 rounded transition-colors ${isActive ? 'hover:bg-white/20' : 'hover:bg-white/10'}`}
              title="Rename"
            >
              <SafeIcon icon={FiEdit2} className="text-[10px]" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(tab.id); }}
              className={`p-1 rounded transition-colors hover:text-red-400 ${isActive ? 'hover:bg-white/20' : 'hover:bg-white/10'}`}
              title="Delete"
            >
              <SafeIcon icon={FiTrash2} className="text-[10px]" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 bg-gray-950 text-gray-300 flex flex-col h-screen shrink-0 shadow-2xl z-20 border-r border-white/5">
      <div className="p-6 shrink-0">
        <h1 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <SafeIcon icon={FiLayout} className="text-white text-lg" />
          </div>
          Ditto
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-1 custom-scrollbar pb-6">
        {fixedTabs.map((tab) => renderTab(tab, true))}

        {dynamicTabs.length > 0 && (
          <div className="pt-2 pb-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-widest text-gray-600">
              Web Tabs
            </div>
          </div>
        )}

        {dynamicTabs.map((tab) => renderTab(tab, false))}

        <button
          onClick={onAdd}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/5 rounded-lg transition-all duration-200 text-sm font-medium border border-dashed border-white/10 hover:border-indigo-500/30 mt-2"
        >
          <SafeIcon icon={FiPlus} className="text-lg" />
          Add Web Tab
        </button>
      </div>

      <div className="p-4 shrink-0 bg-black/20 border-t border-white/5 text-[10px] text-gray-600 text-center uppercase tracking-widest font-bold">
        Ditto Workspace
      </div>
    </div>
  );
}
