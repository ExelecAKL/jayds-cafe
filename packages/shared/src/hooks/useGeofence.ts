// packages/shared/src/hooks/useGeofence.ts
// Geofence check: restrict ordering to Dasmariñas, Imus, and Bacoor, Cavite

'use client';

import { useState, useEffect, useCallback } from 'react';

// Base Cafe Location
export const CAFE_LOCATION = { name: 'Jayds Cafe', lat: 14.346621, lng: 120.981057, radiusKm: 8.0 };

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type GeofenceStatus = 'checking' | 'allowed' | 'denied' | 'unavailable' | 'error';

export interface GeofenceResult {
  status: GeofenceStatus;
  zone: string | null;      // Name of the matched zone
  distance: number | null;  // Distance to cafe in km
  recheck: () => void;
}

export function useGeofence(): GeofenceResult {
  const [status, setStatus] = useState<GeofenceStatus>('checking');
  const [zone, setZone] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  const check = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    setStatus('checking');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        
        const d = haversineKm(latitude, longitude, CAFE_LOCATION.lat, CAFE_LOCATION.lng);
        setDistance(Math.round(d * 10) / 10);

        if (d <= CAFE_LOCATION.radiusKm) {
          setZone(CAFE_LOCATION.name);
          setStatus('allowed');
        } else {
          setZone(null);
          setStatus('denied');
        }
      },
      (err) => {
        console.warn('Geofence: location error', err.message);
        // If user denied permission, still let them browse (just block checkout)
        setStatus(err.code === 1 ? 'unavailable' : 'error');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { status, zone, distance, recheck: check };
}
