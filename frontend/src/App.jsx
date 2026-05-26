import React, { useState, useEffect } from 'react';
import supabase from './supabase/supabase';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import DashboardView from './components/DashboardView';
import IframeView from './components/IframeView';
import SettingsModal from './components/SettingsModal';
import SafeIcon from './common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import './App.css';

const { FiLoader } = FiIcons;

const FIXED_TABS = [
  { id: 'chat', name: 'HubSpot Chat', type: 'fixed' },
  { id: 'dashboard', name: 'Dashboard', type: 'fixed' },
];

function App() {
  const [dynamicTabs, setDynamicTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState('chat');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTabs = async () => {
    try {
      const { data, error } = await supabase
        .from('portal_tabs_20240522')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setDynamicTabs(data || []);
    } catch (error) {
      console.error('Error fetching tabs:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTabs();
    const channel = supabase
      .channel('portal_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_tabs_20240522' }, fetchTabs)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const handleAddTab = async () => {
    const name = prompt('Enter tab name:', `New Tab ${dynamicTabs.length + 1}`);
    if (!name) return;
    try {
      const { data, error } = await supabase
        .from('portal_tabs_20240522')
        .insert([{ name, url: '' }])
        .select();
      if (error) throw error;
      await fetchTabs();
      if (data?.[0]) setActiveTabId(data[0].id);
    } catch (e) {
      alert('Failed to add tab.');
    }
  };

  const handleRenameTab = async (id, newName) => {
    try {
      const { error } = await supabase
        .from('portal_tabs_20240522')
        .update({ name: newName })
        .eq('id', id);
      if (error) throw error;
      await fetchTabs();
    } catch (e) { console.error(e); }
  };

  const handleDeleteTab = async (id) => {
    if (!confirm('Delete this tab?')) return;
    try {
      const { error } = await supabase
        .from('portal_tabs_20240522')
        .delete()
        .eq('id', id);
      if (error) throw error;
      if (activeTabId === id) setActiveTabId('chat');
      await fetchTabs();
    } catch (e) { console.error(e); }
  };

  const handleSaveUrl = async (newUrl) => {
    try {
      const { error } = await supabase
        .from('portal_tabs_20240522')
        .update({ url: newUrl })
        .eq('id', activeTabId);
      if (error) throw error;
      await fetchTabs();
    } catch (e) { alert('Failed to save URL.'); }
  };

  const activeIframeTab = dynamicTabs.find(t => t.id === activeTabId) || null;
  const isIframeActive = activeIframeTab !== null;

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <SafeIcon icon={FiLoader} className="text-4xl text-indigo-500 animate-spin" />
          <p className="text-gray-400 font-medium tracking-wide">Loading Ditto...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        fixedTabs={FIXED_TABS}
        dynamicTabs={dynamicTabs}
        activeTabId={activeTabId}
        onSelect={setActiveTabId}
        onAdd={handleAddTab}
        onRename={handleRenameTab}
        onDelete={handleDeleteTab}
      />

      <main className="flex-1 overflow-hidden">
        {activeTabId === 'chat' && <ChatView />}
        {activeTabId === 'dashboard' && <DashboardView />}
        {isIframeActive && (
          <IframeView
            tab={activeIframeTab}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}
      </main>

      {isIframeActive && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentUrl={activeIframeTab.url}
          tabName={activeIframeTab.name}
          onSave={handleSaveUrl}
        />
      )}
    </div>
  );
}

export default App;
