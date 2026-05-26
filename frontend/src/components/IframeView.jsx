import React from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiSettings, FiExternalLink } = FiIcons;

export default function IframeView({ tab, onOpenSettings }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white relative">
      <div className="h-14 min-h-[3.5rem] bg-white border-b border-gray-100 flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-md border border-gray-100">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <h2 className="text-sm font-bold text-gray-700 truncate max-w-[200px]">
              {tab.name}
            </h2>
          </div>
          {tab.url && (
            <span className="hidden md:inline text-[11px] font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded truncate max-w-xs border border-gray-100">
              {tab.url}
            </span>
          )}
        </div>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm text-sm font-medium"
          title="Configure Tab URL"
        >
          <SafeIcon icon={FiSettings} className="text-lg text-gray-400" />
          <span>Settings</span>
        </button>
      </div>

      <div className="flex-1 relative w-full h-full bg-gray-50">
        {tab.url ? (
          <iframe
            src={tab.url}
            className="w-full h-full border-none absolute inset-0 bg-white"
            title={tab.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-white">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
              <SafeIcon icon={FiExternalLink} className="text-2xl text-indigo-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No URL configured</h3>
            <p className="text-sm text-gray-500 max-w-xs mb-6">
              Configure a URL in settings to display a website here.
            </p>
            <button
              onClick={onOpenSettings}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/10"
            >
              Configure URL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
