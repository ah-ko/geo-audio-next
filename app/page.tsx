"use client"; // This is essential for Next.js to run this component in the browser

import React, { useState, useEffect, useRef, useCallback } from 'react';

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
          setError(null); // Clear previous errors on new trigger
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

  // --- MAJOR FIX for autoplay loop ---
  // This effect now ONLY runs when `activeAudio` changes.
  // It no longer depends on `locations`, which was causing it to re-trigger on every distance update.
  useEffect(() => {
    if (activeAudio && audioRef.current) {
      audioRef.current.src = activeAudio;
      audioRef.current.muted = false; // Ensure audio is unmuted for playback
      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Audio autoplay was blocked by the browser.", error);
          setError("Your browser blocked autoplay. Please press the play button on the audio player below.");
          // Find the name of the point that was just triggered to provide a helpful message.
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

    // --- KEY FIX: Unlock audio on first user interaction ---
    if (audioRef.current) {
      audioRef.current.muted = true;
      audioRef.current.play().catch(() => {
        // This is expected to fail silently if there's no source,
        // but the user gesture "unlocks" the ability to play audio later.
      });
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

  // Cleanup effect to stop watching location when the component unmounts
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-md mx-auto">
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
