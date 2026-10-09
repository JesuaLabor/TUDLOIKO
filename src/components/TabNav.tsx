import {
  MessageSquare,
  ScrollText,
  BookMarked,
  Sparkles,
  Award,
  Settings,
} from 'lucide-react'

export type Tab = 'chat' | 'transcript' | 'stories' | 'prep' | 'debrief' | 'settings'

interface TabNavProps {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  storyCount?: number
  fillerCount?: number
}

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat',       label: 'Coach',      icon: MessageSquare },
  { id: 'transcript', label: 'Live',       icon: ScrollText },
  { id: 'stories',    label: 'Stories',    icon: BookMarked },
  { id: 'prep',       label: 'Prep',       icon: Sparkles },
  { id: 'debrief',    label: 'Debrief',    icon: Award },
  { id: 'settings',   label: 'Settings',   icon: Settings },
]

export default function TabNav({ activeTab, setActiveTab, storyCount }: TabNavProps) {
  return (
    <div className="flex no-drag px-1.5 pt-1 gap-0.5 border-b border-border bg-surface-subtle/30 overflow-x-auto scrollbar-none">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`
            flex items-center gap-1 px-2 py-1.5 rounded-t-lg text-[10px] font-medium
            transition-all duration-150 border-b-2 flex-1 justify-center whitespace-nowrap min-w-[50px]
            ${activeTab === id
              ? 'text-accent border-accent bg-accent/10 shadow-sm'
              : 'text-text-muted border-transparent hover:text-text-secondary hover:bg-white/5'
            }
          `}
        >
          <Icon size={11} className={activeTab === id ? 'text-accent' : 'opacity-70'} />
          <span>{label}</span>
          {id === 'stories' && typeof storyCount === 'number' && storyCount > 0 && (
            <span className="text-[9px] px-1 py-0.2 rounded-full bg-accent/20 text-accent font-semibold ml-0.5">
              {storyCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
