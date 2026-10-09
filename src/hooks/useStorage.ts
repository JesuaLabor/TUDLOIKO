import { useState, useEffect, useCallback } from 'react'

/** Persist state to localStorage with a given key */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      setStoredValue((prev) => {
        const next = typeof value === 'function' ? (value as (val: T) => T)(prev) : value
        try {
          window.localStorage.setItem(key, JSON.stringify(next))
        } catch {}
        return next
      })
    },
    [key]
  )

  return [storedValue, setValue] as const
}

/** Sync an electron-store value (opacity) on mount */
export function useElectronOpacity() {
  const [opacity, setOpacityState] = useState(0.92)

  useEffect(() => {
    window.electron?.getOpacity().then(setOpacityState).catch(() => {})
  }, [])

  const setOpacity = useCallback((value: number) => {
    setOpacityState(value)
    window.electron?.setOpacity(value).catch(() => {})
  }, [])

  return [opacity, setOpacity] as const
}
