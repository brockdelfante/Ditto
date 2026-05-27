import React, { useState, useRef, useEffect } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiPlus, FiMessageSquare, FiBarChart2, FiGlobe } = FiIcons;

const FIXED_COLORS = {
  chat: '#FF7A59',
  dashboard: '#6366f1',
};
const DYNAMIC_COLOR = '#0ea5e9';

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
    const color = isFixed ? (FIXED_COLORS[tab.id] || DYNAMIC_COLOR) : DYNAMIC_COLOR;
    const Icon = isFixed ? (FIXED_ICONS[tab.id] || FiGlobe) : FiGlobe;

    return (
      <div
        key={tab.id}
        onClick={() => onSelect(tab.id)}
        className={`group relative flex flex-col items-center py-3 mx-1 rounded-xl cursor-pointer transition-all duration-200 ${
          isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
        }`}
      >
        {/* Coloured circle icon */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all duration-200"
          style={{ background: isActive ? color : `${color}28` }}
        >
          <SafeIcon
            icon={Icon}
            className="text-xl"
            style={{ color: isActive ? '#fff' : color }}
          />
        </div>

        {/* Tab label */}
        {!isFixed && editingId === tab.id ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyDown}
            className="w-full text-[9px] text-center bg-blue-50 border border-blue-300 rounded mt-1 px-0.5 outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={`text-[9px] font-medium text-center mt-1.5 leading-tight px-1 w-full block break-words line-clamp-2 ${
              isActive ? 'text-gray-800' : 'text-gray-500'
            }`}
            onDoubleClick={!isFixed ? (e) => { e.stopPropagation(); setEditingId(tab.id); setEditValue(tab.name); } : undefined}
          >
            {tab.name}
          </span>
        )}

        {/* Delete button on hover (dynamic tabs only) */}
        {!isFixed && editingId !== tab.id && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(tab.id); }}
            className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-400 hover:bg-red-500 rounded-full text-white text-[10px] items-center justify-center opacity-0 group-hover:opacity-100 hidden group-hover:flex transition-opacity leading-none"
            title="Delete tab"
          >
            ×
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-16 bg-white border-r border-gray-200 flex flex-col h-screen shrink-0 z-20">
      <div className="flex-1 overflow-y-auto py-3 space-y-1 custom-scrollbar">
        {/* Fixed tabs */}
        {fixedTabs.map((tab) => renderTab(tab, true))}

        {/* Divider before dynamic tabs */}
        {dynamicTabs.length > 0 && (
          <div className="mx-3 border-t border-gray-100 my-1" />
        )}

        {/* Dynamic iframe tabs */}
        {dynamicTabs.map((tab) => renderTab(tab, false))}

        {/* Add Tab button */}
        <div className="px-1 pt-1">
          <button
            onClick={onAdd}
            className="w-full flex flex-col items-center py-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
          >
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 group-hover:border-indigo-400 flex items-center justify-center transition-colors">
              <SafeIcon icon={FiPlus} className="text-lg text-gray-400 group-hover:text-indigo-400 transition-colors" />
            </div>
            <span className="text-[9px] text-gray-400 group-hover:text-indigo-400 mt-1.5 transition-colors font-medium">
              Add
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
