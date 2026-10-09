// ─── Types ────────────────────────────────────────────────────────────────────
export interface AudioDevice {
  deviceId: string
  label: string
  isMonitor: boolean // true for PulseAudio/PipeWire monitor sources
}

export interface CaptureConfig {
  deviceId?: string
  chunkIntervalMs?: number   // timeslice for MediaRecorder buffer collection (default: 1000ms)
  silenceThreshold?: number  // 0–255 RMS amplitude below which counts as silence (default: 10)
  silenceDurationMs?: number // silence delay to trigger utterance end (default: 1500ms)
  maxUtteranceMs?: number    // force flush utterance after N ms (default: 8000ms)
  mode?: 'manual' | 'auto'   // 'manual' waits for Stop; 'auto' flushes on silence pauses
}

export type ChunkCallback = (blob: Blob, mimeType: string) => void
export type SilenceCallback = () => void
export type LevelCallback = (level: number) => void // 0–100 normalized amplitude
export type ErrorCallback = (err: Error) => void

// ─── AudioCaptureManager (Smart VAD Accumulation) ──────────────────────────────
export class AudioCaptureManager {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private vadTimer: ReturnType<typeof setInterval> | null = null
  private maxTimer: ReturnType<typeof setTimeout> | null = null

  private onChunkCb: ChunkCallback | null = null
  private onSilenceCb: SilenceCallback | null = null
  private onLevelCb: LevelCallback | null = null
  private onErrorCb: ErrorCallback | null = null

  private isSilent = true
  private isCapturing = false
  private captureMode: 'manual' | 'auto' = 'manual'

  // Smart VAD Utterance Buffer
  private chunksBuffer: Blob[] = []
  private hasSpokenInCurrentUtterance = false
  private currentMimeType = 'audio/webm'

  // ── Device enumeration ──────────────────────────────────────────────────────
  static async listDevices(): Promise<AudioDevice[]> {
    try {
      // Request a temporary stream so browsers populate device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      tempStream.getTracks().forEach((t) => t.stop())
    } catch {
      // Ignore — labels might still be populated if permission was previously granted
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`,
        // PulseAudio monitor sources typically contain "monitor" in the label
        isMonitor: d.label.toLowerCase().includes('monitor'),
      }))
  }

  // ── Start capture ───────────────────────────────────────────────────────────
  async start(config: CaptureConfig = {}): Promise<void> {
    if (this.isCapturing) return
    const {
      deviceId,
      silenceThreshold = 10,
      silenceDurationMs = 1500,
      maxUtteranceMs = 8000,
      mode = 'manual',
    } = config

    this.captureMode = mode
    this.chunksBuffer = []
    this.hasSpokenInCurrentUtterance = false
    this.isSilent = true

    try {
      // Get audio stream
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      }
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)

      // Set up Web Audio API for VAD
      this.audioCtx = new AudioContext()
      const source = this.audioCtx.createMediaStreamSource(this.stream)
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 512
      source.connect(this.analyser)

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg'
      this.currentMimeType = mimeType

      this.recorder = new MediaRecorder(this.stream, { mimeType })

      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 200) {
          // Accumulate raw audio slice into buffer
          this.chunksBuffer.push(e.data)
        }
      }

      this.recorder.onerror = (e) => {
        this.onErrorCb?.(new Error(`MediaRecorder error: ${e.type}`))
      }

      // Collect slice every 800ms
      this.recorder.start(800)
      this.isCapturing = true

      // ── VAD polling ──────────────────────────────────────────────────────────
      const dataArray = new Uint8Array(this.analyser.fftSize)
      this.vadTimer = setInterval(() => {
        if (!this.analyser) return
        this.analyser.getByteTimeDomainData(dataArray)

        // RMS amplitude
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const val = dataArray[i] - 128
          sum += val * val
        }
        const rms = Math.sqrt(sum / dataArray.length)

        // Normalize 0–100 for UI visualizer
        const level = Math.min(100, Math.round((rms / 128) * 100 * 4))
        this.onLevelCb?.(level)

        // Voice Activity Detection logic
        if (rms >= silenceThreshold) {
          this.hasSpokenInCurrentUtterance = true
          this.isSilent = false
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer)
            this.silenceTimer = null
          }

          // In 'auto' mode only: flush if single utterance exceeds max length
          if (this.captureMode === 'auto') {
            if (!this.maxTimer) {
              this.maxTimer = setTimeout(() => {
                this.flushUtterance()
              }, maxUtteranceMs)
            }
          }
        } else {
          // Silence detected
          // In 'auto' mode only: automatically flush utterance on pause
          if (this.captureMode === 'auto' && !this.isSilent && this.hasSpokenInCurrentUtterance) {
            this.isSilent = true
            this.silenceTimer = setTimeout(() => {
              this.flushUtterance()
              this.onSilenceCb?.()
            }, silenceDurationMs)
          }
        }
      }, 80) // poll every 80ms (~12fps)
    } catch (err) {
      this.onErrorCb?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  // ── Combine and emit accumulated utterance ──────────────────────────────────
  private flushUtterance(): void {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null }
    if (this.maxTimer) { clearTimeout(this.maxTimer); this.maxTimer = null }

    if (this.hasSpokenInCurrentUtterance && this.chunksBuffer.length > 0) {
      const combinedBlob = new Blob(this.chunksBuffer, { type: this.currentMimeType })
      if (combinedBlob.size > 1000 && this.onChunkCb) {
        this.onChunkCb(combinedBlob, this.currentMimeType)
      }
    }

    // Reset buffer for next question/utterance
    this.chunksBuffer = []
    this.hasSpokenInCurrentUtterance = false
    this.isSilent = true
  }

  // ── Stop capture ────────────────────────────────────────────────────────────
  async stop(flush: boolean = true): Promise<void> {
    if (this.vadTimer) { clearInterval(this.vadTimer); this.vadTimer = null }
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null }
    if (this.maxTimer) { clearTimeout(this.maxTimer); this.maxTimer = null }

    const recorder = this.recorder
    this.recorder = null
    this.isCapturing = false

    // Properly await the recorder's onstop event to ensure all trailing data chunks are flushed
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        try {
          recorder.stop()
        } catch {
          resolve()
        }
      })
      recorder.ondataavailable = null
      recorder.onstop = null
    }

    if (this.audioCtx) {
      try { await this.audioCtx.close() } catch {}
      this.audioCtx = null
    }
    this.analyser = null

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }

    if (flush && this.chunksBuffer.length > 0) {
      const combinedBlob = new Blob(this.chunksBuffer, { type: this.currentMimeType })
      this.chunksBuffer = []
      this.hasSpokenInCurrentUtterance = false
      this.isSilent = true

      // Only dispatch if the recorded audio has valid content
      if (combinedBlob.size >= 800 && this.onChunkCb) {
        this.onChunkCb(combinedBlob, this.currentMimeType)
      }
    } else {
      this.chunksBuffer = []
      this.hasSpokenInCurrentUtterance = false
      this.isSilent = true
    }
  }

  // ── Event registration ──────────────────────────────────────────────────────
  onChunk(cb: ChunkCallback)   { this.onChunkCb = cb; return this }
  onSilence(cb: SilenceCallback) { this.onSilenceCb = cb; return this }
  onLevel(cb: LevelCallback)   { this.onLevelCb = cb; return this }
  onError(cb: ErrorCallback)   { this.onErrorCb = cb; return this }

  get capturing() { return this.isCapturing }
}

// ─── Blob → base64 helper ─────────────────────────────────────────────────────
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!blob || blob.size === 0) {
      resolve('')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      if (!result || !result.includes(',')) {
        resolve('')
        return
      }
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
