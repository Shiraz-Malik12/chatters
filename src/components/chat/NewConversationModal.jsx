import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useChat } from '../../context/ChatContext';
import { searchUsers } from '../../api/users';
import Avatar from './Avatar';
import Button from '../Button';
import Input from '../Input';

const NewConversationModal = ({ onClose }) => {
  const { startPrivateConversation, startGroupConversation, selectConversation } = useChat();
  const [mode, setMode] = useState('direct');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      return undefined;
    }

    setSearching(true);
    const timeoutId = setTimeout(() => {
      searchUsers(trimmed)
        .then((users) => setResults(users))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const toggleSelectedUser = (targetUser) => {
    setSelectedUsers((current) => {
      const alreadySelected = current.some((item) => item._id === targetUser._id);
      if (alreadySelected) return current.filter((item) => item._id !== targetUser._id);
      return [...current, targetUser];
    });
  };

  const handleSelectDirect = async (targetUser) => {
    try {
      setSubmitting(true);
      const conversation = await startPrivateConversation(targetUser._id);
      await selectConversation(conversation._id);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || error.response?.data?.message || 'Could not start conversation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error('Group name is required');
      return;
    }

    if (selectedUsers.length < 2) {
      toast.error('Select at least 2 people for a group');
      return;
    }

    try {
      setSubmitting(true);
      const conversation = await startGroupConversation({
        name: groupName.trim(),
        members: selectedUsers.map((item) => item._id),
      });
      await selectConversation(conversation._id);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || error.response?.data?.message || 'Could not create group');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950/95 p-6 shadow-2xl shadow-cyan-950/30">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">New conversation</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-white">
            <Icon icon="mdi:close" width={22} />
          </button>
        </div>

        <div className="mb-4 flex gap-2 rounded-2xl bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setMode('direct')}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              mode === 'direct' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Direct message
          </button>
          <button
            type="button"
            onClick={() => setMode('group')}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              mode === 'group' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Group
          </button>
        </div>

        {mode === 'group' ? (
          <div className="mb-4">
            <Input
              label="Group name"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="e.g. Weekend Trip"
            />
          </div>
        ) : null}

        <Input
          label="Search people"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or email"
        />

        {mode === 'group' && selectedUsers.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedUsers.map((selected) => (
              <span
                key={selected._id}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-100"
              >
                {selected.name}
                <button type="button" onClick={() => toggleSelectedUser(selected)} className="text-slate-400 hover:text-white">
                  <Icon icon="mdi:close" width={14} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 max-h-64 space-y-1 overflow-y-auto">
          {searching ? <p className="py-4 text-center text-sm text-slate-400">Searching...</p> : null}

          {!searching && query.trim() && results.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No users found</p>
          ) : null}

          {results.map((result) => {
            const isSelected = selectedUsers.some((item) => item._id === result._id);

            return (
              <button
                key={result._id}
                type="button"
                disabled={submitting}
                onClick={() => (mode === 'direct' ? handleSelectDirect(result) : toggleSelectedUser(result))}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition disabled:opacity-60 ${
                  isSelected ? 'bg-cyan-500/20' : 'hover:bg-white/5'
                }`}
              >
                <Avatar name={result.name} src={result.avatar} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">{result.name}</span>
                  <span className="block truncate text-xs text-slate-400">{result.email}</span>
                </span>
                {mode === 'group' && isSelected ? <Icon icon="mdi:check-circle" className="text-cyan-400" width={20} /> : null}
              </button>
            );
          })}
        </div>

        {mode === 'group' ? (
          <div className="mt-4">
            <Button onClick={handleCreateGroup} loading={submitting}>
              Create group
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default NewConversationModal;
