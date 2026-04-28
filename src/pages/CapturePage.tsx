import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Upload, RotateCcw, Camera } from 'lucide-react';
import { useAnalysisStore } from '../lib/store/analysisStore';
import { ModeToggle } from '../components/camera/ModeToggle';
import { FramingCoach } from '../components/camera/FramingCoach';
import { SilhouetteOverlay } from '../components/camera/SilhouetteOverlay';

export function CapturePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const intent = searchParams.get('intent') === 'highlight' ? 'highlight' : 'analyze';
  const nextRoute = intent === 'highlight' ? '/highlight' : '/processing';
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const {
    mode,
    isRecording,
    setRecording,
    setCurrentVideo,
    framingFeedback,
    setFramingFeedback,
  } = useAnalysisStore();

  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const startCamera = useCallback(async () => {
    // Check if camera is available without triggering a permission prompt
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraActive(false);
      setFramingFeedback({ status: 'searching', message: 'Camera not available — use gallery upload below' });
      return;
    }

    try {
      // Race with a timeout to avoid hanging on permission dialogs
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: false,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setFramingFeedback({ status: 'searching', message: t('capture.framing.searching') });
    } catch {
      setCameraActive(false);
      setFramingFeedback({
        status: 'searching',
        message: 'Camera not available — use gallery upload below',
      });
    }
  }, [facingMode, setFramingFeedback, t]);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [startCamera]);

  const flipCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm',
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const file = new File([blob], 'recording.webm', { type: 'video/webm' });
      setCurrentVideo(url, file);
      navigate(nextRoute);
    };
    mediaRecorderRef.current = recorder;
    recorder.start(100);
    setRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    setFramingFeedback({ status: 'recording', message: t('capture.framing.recording') });
  }, [navigate, setCurrentVideo, setRecording, setFramingFeedback, t]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [setRecording]);

  const handleTapRecord = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') stopRecording();
      }, 8000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCurrentVideo(url, file);

    // Highlight intent always goes straight to the reel — long clips are expected
    if (intent === 'highlight') {
      navigate('/highlight');
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (video.duration > 120) {
        navigate('/long-video');
      } else {
        navigate('/processing');
      }
    };
    video.onerror = () => navigate('/processing');
    video.src = url;
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="relative h-full flex flex-col bg-black">
      {/* Camera viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          playsInline
          muted
        />

        {/* Gradient overlays */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent z-10" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent z-10" />

        {/* Mode toggle - top */}
        <div className="absolute top-4 inset-x-0 z-20 flex justify-center">
          <ModeToggle />
        </div>

        {/* Silhouette overlay */}
        {!isRecording && <SilhouetteOverlay mode={mode} />}

        {/* Framing coach */}
        <FramingCoach />

        {/* Recording timer */}
        {isRecording && (
          <div className="absolute top-16 inset-x-0 z-20 flex justify-center">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-red/20 border border-accent-red/40">
              <div className="w-2.5 h-2.5 rounded-full bg-accent-red animate-pulse" />
              <span className="text-sm font-mono font-medium text-accent-red">
                {formatTime(recordingTime)}
              </span>
            </div>
          </div>
        )}

        {/* Camera not available overlay */}
        {!cameraActive && (
          <div className="absolute inset-0 z-15 flex items-center justify-center bg-bg-primary/90">
            <div className="text-center px-8">
              <Camera size={48} className="mx-auto mb-4 text-text-muted" />
              <p className="text-text-secondary mb-2">Camera not available</p>
              <p className="text-text-muted text-sm">Upload a video from your gallery instead</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="relative z-20 px-6 pb-6 pt-4 flex items-center justify-between bg-gradient-to-t from-black via-black/90 to-transparent -mt-8">
        {/* Gallery upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-1"
        >
          <div className="w-12 h-12 rounded-xl glass flex items-center justify-center">
            <Upload size={20} className="text-text-primary" />
          </div>
          <span className="text-[10px] text-text-muted">Gallery</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Record button */}
        <button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onClick={!cameraActive ? () => fileInputRef.current?.click() : handleTapRecord}
          className="relative"
        >
          <div
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-200 ${
              isRecording
                ? 'border-accent-red bg-accent-red/20 scale-110'
                : 'border-white/80 bg-transparent'
            }`}
          >
            <div
              className={`transition-all duration-200 ${
                isRecording
                  ? 'w-8 h-8 rounded-md bg-accent-red'
                  : 'w-16 h-16 rounded-full bg-white/90'
              }`}
            />
          </div>
          <span className="absolute -bottom-5 inset-x-0 text-[10px] text-text-muted text-center">
            {cameraActive ? (isRecording ? 'Stop' : 'Hold or tap') : 'Upload'}
          </span>
        </button>

        {/* Flip camera */}
        <button
          onClick={flipCamera}
          className="flex flex-col items-center gap-1"
          disabled={!cameraActive}
        >
          <div className="w-12 h-12 rounded-xl glass flex items-center justify-center">
            <RotateCcw size={20} className={cameraActive ? 'text-text-primary' : 'text-text-muted'} />
          </div>
          <span className="text-[10px] text-text-muted">Flip</span>
        </button>
      </div>
    </div>
  );
}
