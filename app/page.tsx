"use client"; // This is essential for Next.js to run this component in the browser

import React, { useState, useEffect, useRef, useCallback } from "react";

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
    description:
      "This is where the story of the family cabin unfolds. Listen to memories of growing up by the water.",
  },
  {
    id: 2,
    name: "Approx. Wylie Road Schoolhouse Location",
    lat: 46.0997975,
    lon: -77.4900301,
    audioSrc: "/oldcabin.m4a",
    description:
      "Imagine the long walk to the one-room schoolhouse. This audio clip shares what school was like in the 1940s.",
  },
    {
    id: 3,
    name: "Approx. 69 Lange Rd",
    lat: 46.1581327,
    lon: -77.632293,
    audioSrc: "/oldcabin.m4a",
    description:
      "69 Lange Rd",
  },
];

const TRIGGER_RADIUS = 30; // Distance in meters to trigger a point of interest

// --- Helper Function: Haversine Formula for Distance Calculation ---
function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// --- Custom Hook to dynamically load external scripts ---
const useScript = (url: string) => {
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => setIsLoaded(true);
    document.body.appendChild(script);

    // Clean up by removing the script when the component unmounts
    return () => {
      document.body.removeChild(script);
    };
  }, [url]);
  return isLoaded;
};

const ARComponent = ({ onClose }: { onClose: () => void }) => {
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const isAFrameLoaded = useScript(
    "https://aframe.io/releases/1.5.0/aframe.min.js"
  );
  const isMindARLoaded = useScript(
    "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"
  );

  useEffect(() => {
    if (isAFrameLoaded && isMindARLoaded && sceneContainerRef.current) {
      const container = sceneContainerRef.current;
      const sceneHTML = `
        <a-scene
          mindar-image="imageTargetSrc: /targets.mind; autoStart: true; uiLoading: ar; uiScanning: ar; filterMinCF: 0.01; filterBeta: 10;"
          
          color-space="sRGB"
          renderer="colorManagement: true; physicallyCorrectLights: true; alpha: true;"
          vr-mode-ui="enabled: false"
          device-orientation-permission-ui="enabled: false"
          embedded
        >
          <a-assets>
            <img id="familyPhoto" src="/family-photo.png" alt="Family historical photograph" />
          </a-assets>
          <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
          <a-entity mindar-image-target="targetIndex: 0">
             
             <a-plane 
                material="src: #familyPhoto; transparent: true; shader: flat; alphaTest: 0.5;" 
                
                position="0.2 -0.25 0" 

                scale="0.5 0.5 0.5"
                height="1" 
                width="1.5" 
                rotation="0 0 0">
             </a-plane>

          </a-entity>
        </a-scene>
      `;
      container.innerHTML = sceneHTML;

      return () => {
        container.innerHTML = "";
      };
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

      <div ref={sceneContainerRef} className="w-full h-full" />

      {(!isAFrameLoaded || !isMindARLoaded) && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-75">
          <p className="text-white text-lg">
            Loading AR Libraries...
          </p>
        </div>
      )}
    </div>
  );
};


// --- Main Page Component ---
export default function Home() {
  // State management for the application
  const [locations, setLocations] = useState<LocationState[]>(
    pointsOfInterest.map((p) => ({
      ...p,
      played: false,
      distance: Infinity,
    }))
  );
  const [currentPosition, setCurrentPosition] = useState<Coordinates | null>(
    null
  );
  const [statusMessage, setStatusMessage] = useState<string>(
    "Click 'Start Tour' to begin."
  );
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showAR, setShowAR] = useState(false);

  // Refs for DOM elements and watch ID
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const processLocationUpdate = useCallback(
    (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      setCurrentPosition({ latitude, longitude });

      let nearestPoint: LocationState | { distance: number } = {
        distance: Infinity,
      };
      let didTriggerAudio = false;

      setLocations((prevLocations) => {
        const updatedLocations = prevLocations.map((point) => {
          const distance = getDistance(
            latitude,
            longitude,
            point.lat,
            point.lon
          );

          if (
            distance <
            (nearestPoint as { distance: number }).distance
          ) {
            nearestPoint = { ...point, distance };
          }

          // This is the block that runs when a point is "visited"
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
          if (
            (nearestPoint as { distance: number }).distance ===
            Infinity
          ) {
            setStatusMessage("Searching for points of interest...");
          } else {
            setStatusMessage(
              `Walk towards ${(nearestPoint as LocationState).name
              } (${Math.round(
                (nearestPoint as { distance: number }).distance
              )}m away)`
            );
          }
        }

        return updatedLocations;
      });
    },
    [] // Dependencies remain empty
  );

  // Effect to handle playing audio when a new track is activated
  useEffect(() => {
    if (activeAudio && audioRef.current) {
      audioRef.current.src = activeAudio;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error("Audio autoplay was blocked:", err);
          setError(
            "Your browser blocked autoplay. Please press play on the audio player."
          );
        });
      }
    }
  }, [activeAudio]);

  // Function to start the location tracking
  const handleStartTour = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    // A common trick to "unlock" audio on mobile browsers requires a user interaction
    if (audioRef.current) {
      audioRef.current.muted = true;
      audioRef.current.play().catch(() => { });
      audioRef.current.muted = false;
    }

    // Get initial position and then start watching for changes
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
        setError(
          `Permission Denied: ${err.message}. Please enable location services.`
        );
      }
    );
  };

  // Cleanup effect to stop watching the user's location when the component unmounts
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // JSX for rendering the component
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 font-sans">
      {/* Conditionally render the AR component when showAR is true */}
      {showAR && <ARComponent onClose={() => setShowAR(false)} />}

      {/* Main UI is hidden when the AR view is active */}
      <div
        className={`w-full max-w-md mx-auto ${showAR ? "hidden" : ""}`}
      >
        <header className="text-center mb-6">
          <h1 className="text-4xl font-bold text-teal-400">
            Deep River Audio Tour
          </h1>
          <p className="text-gray-400 mt-2">
            A Location-Aware Historical Experience
          </p>
        </header>

        <main className="bg-gray-800 rounded-lg shadow-lg p-6">
          {!isWatching ? (
            <button
              onClick={handleStartTour}
              className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-4 rounded-lg text-lg transition-transform transform hover:scale-105"
            >
              Start Tour
            </button>
          ) : (
            <div className="text-center">
              <div className="bg-gray-700 p-4 rounded-lg">
                <p className="font-semibold text-lg">Status:</p>
                <p className="text-teal-300 text-md min-h-[48px] flex items-center justify-center">
                  {statusMessage}
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-400 mt-4 text-center">{error}</p>
          )}

          <div className="mt-6">
            <h2 className="text-xl font-semibold border-b-2 border-gray-600 pb-2 mb-4">
              Points of Interest
            </h2>
            <ul className="space-y-4">
              {locations.map((point) => (
                <li
                  key={point.id}
                  className={`p-4 rounded-lg transition-all ${point.played
                      ? "bg-teal-900/50"
                      : "bg-gray-700"
                    }`}
                >
                  <h3 className="font-bold">{point.name}</h3>
                  <p className="text-sm text-gray-400">
                    {point.description}
                  </p>
                  <p className="text-xs mt-2 text-teal-400">
                    {point.distance === Infinity
                      ? `Distance: Not Available`
                      : `Distance: ${Math.round(
                        point.distance
                      )}m`}
                    {point.played && (
                      <span className="ml-2 font-bold text-green-400">
                        (Visited ✔)
                      </span>
                    )}
                  </p>

                  {/* Conditionally render the button to launch the AR experience */}
                  {point.played && (
                    <button
                      onClick={() => setShowAR(true)}
                      className="mt-3 w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-transform transform hover:scale-105"
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
          <p>
            Ensure your device's location services are enabled for
            the best experience.
          </p>
        </footer>
      </div>
    </div>
  );
}
