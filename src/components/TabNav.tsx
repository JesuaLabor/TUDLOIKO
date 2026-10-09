import { MessageSquare, FileText, Settings, ScrollText } from 'lucide-react'

type Tab = 'chat' | 'transcript' | 'context' | 'settings'

interface TabNavProps {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
}

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat',       label: 'Copilot',    icon: MessageSquare },
  { id: 'transcript', label: 'Transcript', icon: ScrollText },
  { id: 'context',    label: 'Context',    icon: FileText },
  { id: 'settings',   label: 'Settings',   icon: Settings },
]

export default function TabNav({ activeTab, setActiveTab }: TabNavProps) {
  return (
    <div className="flex no-drag px-2 pt-1.5 gap-0.5 border-b border-border">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`
            flex items-center gap-1 px-2.5 py-1.5 rounded-t-lg text-[11px] font-medium
            transition-all duration-150 border-b-2 flex-1 justify-center
            ${activeTab === id
              ? 'text-accent border-accent bg-accent/8'
              : 'text-text-muted border-transparent hover:text-text-secondary hover:bg-white/5'
            }
          `}
        >
          <Icon size={11} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
