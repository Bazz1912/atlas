import { useCallback, useEffect, useRef, useState } from 'react'
import type { Experience, ReviewDraft } from '../domain'
import { loadExperiences, saveExperience, type StorageMode } from '../services/repository'

export function useExperiences(mode: StorageMode) {
  const [items, setItems] = useState<Experience[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++request.current
    setLoading(true)
    setError('')
    try {
      const loaded = await loadExperiences(mode)
      if (current === request.current) setItems(loaded)
    } catch (err) {
      if (current === request.current)
        setError(err instanceof Error ? err.message : 'Archivio non disponibile.')
    } finally {
      if (current === request.current) setLoading(false)
    }
  }, [mode])
  useEffect(() => {
    setItems([])
    void refresh()
    return () => {
      request.current++
    }
  }, [refresh])
  const save = async (item: Experience, photo: Blob | null = null, review?: ReviewDraft) => {
    const stored = await saveExperience(item, photo, mode, review)
    setItems((current) => [stored, ...current.filter((existing) => existing.id !== stored.id)])
    return stored
  }
  return { items, loading, error, refresh, save }
}
