'use client';
import { Suspense } from 'react';
import { PurchasingWorkspace } from '../../../components/PurchasingWorkspace';
export default function PurchasingPage() { return <Suspense fallback={<p>Loading purchasing…</p>}><PurchasingWorkspace /></Suspense>; }
