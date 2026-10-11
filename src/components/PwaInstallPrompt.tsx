import { useState, useEffect } from 'react'
import { Download, Share, PlusSquare, X, Check, Sparkles } from 'lucide-react'

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Detect standalone PWA mode
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://')
      setIsStandalone(isStandaloneMode)
    }

    checkStandalone()

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase()
    const iosDevice = /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(iosDevice)

    // Listen for Chrome/Edge/Android beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    // Listen for successful install
    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsInstalled(true)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const promptInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
        setIsInstalled(true)
      }
    }
  }

  return {
    isInstallable: Boolean(deferredPrompt),
    isStandalone,
    isIOS,
    isInstalled,
    promptInstall,
  }
}

interface PwaInstallButtonProps {
  onOpenIosGuide?: () => void
}

export function PwaInstallButton({ onOpenIosGuide }: PwaInstallButtonProps) {
  const { isInstallable, isStandalone, isIOS, promptInstall } = usePwaInstall()

  // If already running in standalone PWA or Electron, hide the install button
  const isElectron = typeof window !== 'undefined' && Boolean(window.electron?.isElectron)
  if (isStandalone || isElectron) return null

  // If browser supports native install prompt
  if (isInstallable) {
    return (
      <button
        onClick={promptInstall}
        title="Install TUDLOIKO as a Progressive Web App"
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 active:scale-95 transition-all shadow-xs"
      >
        <Download size={11} className="text-accent animate-bounce" />
        <span>Install App</span>
      </button>
    )
  }

  // If on iOS Safari, clicking shows the Add to Home Screen guide
  if (isIOS) {
    return (
      <button
        onClick={onOpenIosGuide}
        title="Add TUDLOIKO to Home Screen on iPhone/iPad"
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-accent/15 border border-accent/35 text-accent hover:bg-accent/25 active:scale-95 transition-all"
      >
        <Download size={11} className="text-accent" />
        <span>Install App</span>
      </button>
    )
  }

  // Fallback install button for other browsers
  return (
    <button
      onClick={() => onOpenIosGuide?.()}
      title="Install or Add TUDLOIKO to Home Screen"
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 border border-white/10 text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
    >
      <Download size={10} />
      <span>Install App</span>
    </button>
  )
}

interface IosInstallModalProps {
  isOpen: boolean
  onClose: () => void
}

export function IosInstallModal({ isOpen, onClose }: IosInstallModalProps) {
  const { isIOS } = usePwaInstall()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-surface-card border border-accent/40 shadow-2xl p-5 space-y-4 animate-slide-up relative">
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
          title="Close"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">Install TUDLOIKO</h3>
            <p className="text-[11px] text-text-muted">
              {isIOS ? 'Add to Home Screen on Safari' : 'Install as a standalone web app'}
            </p>
          </div>
        </div>

        {/* Step-by-step instructions */}
        <div className="space-y-2.5 pt-1 text-xs text-text-secondary">
          {isIOS ? (
            <>
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Share size={12} />
                </div>
                <div>
                  <p className="font-semibold text-text-primary">1. Tap Share</p>
                  <p className="text-[11px] text-text-muted">In Safari's bottom toolbar, tap the <strong>Share</strong> button.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="w-5 h-5 rounded-md bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0 mt-0.5">
                  <PlusSquare size={12} />
                </div>
                <div>
                  <p className="font-semibold text-text-primary">2. Add to Home Screen</p>
                  <p className="text-[11px] text-text-muted">Scroll down in the share sheet and tap <strong>"Add to Home Screen"</strong>.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} />
                </div>
                <div>
                  <p className="font-semibold text-text-primary">3. Launch standalone</p>
                  <p className="text-[11px] text-text-muted">Open TUDLOIKO from your phone home screen with zero browser bars.</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Share size={12} />
                </div>
                <div>
                  <p className="font-semibold text-text-primary">1. Open Browser Menu</p>
                  <p className="text-[11px] text-text-muted">Tap the <strong>⋮</strong> or <strong>⋯</strong> menu icon in your browser.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="w-5 h-5 rounded-md bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0 mt-0.5">
                  <PlusSquare size={12} />
                </div>
                <div>
                  <p className="font-semibold text-text-primary">2. Install or Add</p>
                  <p className="text-[11px] text-text-muted">Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} />
                </div>
                <div>
                  <p className="font-semibold text-text-primary">3. Enjoy native feel</p>
                  <p className="text-[11px] text-text-muted">Runs in its own window with offline caching and faster load times.</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent/90 active:scale-95 transition-all shadow-sm"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
