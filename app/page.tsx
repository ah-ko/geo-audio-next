"use client"; // This is essential for Next.js to run this component in the browser

import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- A-Frame JSX Type Declarations ---
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'a-scene': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'a-assets': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'a-camera': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'a-entity': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'a-plane': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      // Add more A-Frame elements as needed
    }
  }
}

// --- Type Definitions for TypeScript ---
interface PointOfInterest {
  id: number;
  name: string;
  lat: number;
  lon: number;
  audioSrc: string;
  description: string;
}

interface LocationState extends PointOfInterest {
  played: boolean;
  distance: number;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

// --- Configuration ---
const pointsOfInterest: PointOfInterest[] = [
  {
    id: 1,
    name: "The Old Adams Cabin Site",
    lat: 46.106953,
    lon: -77.489467,

    audioSrc: "/oldcabin.m4a",
    description: "This is where the story of the family cabin unfolds. Listen to memories of growing up by the water."
  },
  {
    id: 2,
    name: "Approx. Wylie Road Schoolhouse Location",
    lat: 46.0997975,
    lon: -77.4900301,
    audioSrc: "/oldcabin.m4a",
    description: "Imagine the long walk to the one-room schoolhouse. This audio clip shares what school was like in the 1940s."
  },
];

const TRIGGER_RADIUS = 30; // 30 meters

// --- Helper Function: Haversine Formula for Distance Calculation ---
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// --- Custom Hook to dynamically load scripts ---
const useScript = (url: string) => {
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => setIsLoaded(true);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [url]);
  return isLoaded;
};


// --- NEW AR COMPONENT ---
const ARComponent = ({ onClose }: { onClose: () => void }) => {
  const sceneRef = useRef<any>(null);
  // Load scripts and only render the scene when they are ready
  const isAFrameLoaded = useScript("https://aframe.io/releases/1.5.0/aframe.min.js");
  const isMindARLoaded = useScript("https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js");

  useEffect(() => {
    if (isAFrameLoaded && isMindARLoaded) {
      const sceneEl = sceneRef.current;
      if (sceneEl) {
        sceneEl.addEventListener('arReady', () => console.log("MindAR is ready"));
        sceneEl.addEventListener('arError', (error: any) => console.error("MindAR error:", error));
      }
    }
  }, [isAFrameLoaded, isMindARLoaded]);
  
  return (
    <div className="fixed top-0 left-0 w-full h-full z-50">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 bg-black bg-opacity-50 text-white font-bold py-2 px-4 rounded-lg z-50"
      >
        Close AR
      </button>
      
      {isAFrameLoaded && isMindARLoaded ? (
        <a-scene
          ref={sceneRef}
          mindar-image="imageTargetSrc: /targets.mind; autoStart: true; uiLoading: ar; uiScanning: ar;"
          color-space="sRGB"
          renderer="colorManagement: true, physicallyCorrectLights"
          vr-mode-ui="enabled: false"
          device-orientation-permission-ui="enabled: false"
          embedded
        >
          <a-assets>
            <img id="familyPhoto" src="/family-photo.png" alt="Family historical photograph" />
          </a-assets>
          <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
          <a-entity mindar-image-target="targetIndex: 0">
            <a-plane src="#familyPhoto" position="0 0 0" height="1" width="1.5" rotation="0 0 0"></a-plane>
          </a-entity>
        </a-scene>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <p>Loading AR Libraries...</p>
        </div>
      )}
    </div>
  );
};


// --- Main Page Component ---
export default function Home() {
  const [locations, setLocations] = useState<LocationState[]>(
    pointsOfInterest.map(p => ({ ...p, played: false, distance: Infinity }))
  );
  const [currentPosition, setCurrentPosition] = useState<Coordinates | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Click 'Start Tour' to begin.");
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showAR, setShowAR] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const processLocationUpdate = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords;
    setCurrentPosition({ latitude, longitude });

    let nearestPoint: LocationState | { distance: number } = { distance: Infinity };
    let didTriggerAudio = false;

    setLocations(prevLocations => {
        const updatedLocations = prevLocations.map(point => {
            const distance = getDistance(latitude, longitude, point.lat, point.lon);

            if (distance < (nearestPoint as { distance: number }).distance) {
                nearestPoint = { ...point, distance };
            }

            if (distance <= TRIGGER_RADIUS && !point.played) {
                setError(null);
                setActiveAudio(point.audioSrc);
                setStatusMessage(`Playing story for: ${point.name}`);
                didTriggerAudio = true;
                return { ...point, played: true, distance };
            }

            return { ...point, distance };
        });

        if (!didTriggerAudio) {
            if ((nearestPoint as { distance: number }).distance === Infinity) {
                setStatusMessage("Searching for points of interest...");
            } else {
                setStatusMessage(`Walk towards ${(nearestPoint as LocationState).name} (${Math.round((nearestPoint as { distance: number }).distance)}m away)`);
            }
        }
        
        return updatedLocations;
    });
  }, []);

  useEffect(() => {
    if (activeAudio && audioRef.current) {
      audioRef.current.src = activeAudio;
      audioRef.current.muted = false;
      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Audio autoplay was blocked by the browser.", error);
          setError("Your browser blocked autoplay. Please press the play button on the audio player below.");
          const lastTriggeredPoint = pointsOfInterest.find(p => p.audioSrc === activeAudio);
          if (lastTriggeredPoint) {
            setStatusMessage(`Audio ready for: ${lastTriggeredPoint.name}. Press play.`);
          }
        });
      }
    }
  }, [activeAudio]);

  const handleStartTour = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    if (audioRef.current) {
        audioRef.current.muted = true;
        audioRef.current.play().catch(() => {});
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsWatching(true);
        setError(null);
        setStatusMessage("Location activated. Walking tour started.");
        processLocationUpdate(position);

        watchIdRef.current = navigator.geolocation.watchPosition(
          processLocationUpdate,
          (err) => setError(`Location Error: ${err.message}`),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      },
      (err) => {
        setError(`Permission Denied: ${err.message}. Please enable location services.`);
      }
    );
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);
  
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 font-sans">
      {showAR && <ARComponent onClose={() => setShowAR(false)} />}
      
      <div className={`w-full max-w-md mx-auto ${showAR ? 'hidden' : ''}`}>
        <header className="text-center mb-6">
          <h1 className="text-4xl font-bold text-teal-400">Deep River Audio Tour</h1>
          <p className="text-gray-400 mt-2">A Location-Aware Historical Experience</p>
        </header>

        <main className="bg-gray-800 rounded-lg shadow-lg p-6">
          {!isWatching ? (
            <>
              <button
                onClick={handleStartTour}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-4 rounded-lg text-lg transition-transform transform hover:scale-105"
              >
                Start Tour
              </button>
              <p className="text-xs text-gray-500 mt-3 text-center">
                Note: Most browsers require this initial tap to enable automatic audio playback on location.
              </p>
            </>
          ) : (
            <div className="text-center">
              <div className="bg-gray-700 p-4 rounded-lg">
                <p className="font-semibold text-lg">Status:</p>
                <p className="text-teal-300 text-md min-h-[48px] flex items-center justify-center">{statusMessage}</p>
              </div>
            </div>
          )}

          {error && <p className="text-red-400 mt-4 text-center">{error}</p>}

          <div className="mt-6">
            <h2 className="text-xl font-semibold border-b-2 border-gray-600 pb-2 mb-4">Points of Interest</h2>
            <ul className="space-y-4">
              {locations.map(point => (
                <li key={point.id} className={`p-4 rounded-lg transition-all ${point.played ? 'bg-teal-900/50' : 'bg-gray-700'}`}>
                  <h3 className="font-bold">{point.name}</h3>
                  <p className="text-sm text-gray-400">{point.description}</p>
                  <p className="text-xs mt-2 text-teal-400">
                    {point.distance === Infinity ? 'Distance: N/A' : `Distance: ${Math.round(point.distance)}m`}
                    {point.played && <span className="ml-2 font-bold text-green-400">(Visited ✔)</span>}
                  </p>
                  {point.id === 1 && point.played && !showAR && (
                    <button
                      onClick={() => setShowAR(true)}
                      className="mt-3 w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg text-sm"
                    >
                      Launch AR Experience
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <audio ref={audioRef} controls className="w-full mt-6" />
        </main>
        
        <footer className="text-center text-gray-500 text-xs mt-8">
            <p>Built for the Deep River History Project.</p>
            <p>Ensure your device's location services are enabled for the best experience.</p>
        </footer>
      </div>
    </div>
  );
}

