'use client';
import { Suspense } from 'react';
import InventoryWorkspace from '../../../components/InventoryWorkspace';
export default function InventoryPage() { return <Suspense fallback={<p className="ops-description">Loading inventory…</p>}><InventoryWorkspace /></Suspense>; }
