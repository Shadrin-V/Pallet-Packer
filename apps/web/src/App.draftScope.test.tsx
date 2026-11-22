import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { bindDraftsToUser } from './lib/draftStorage';
import { emptyOrder } from './screens/setup/setupState';
import { VEHICLE_PRESETS, vehicleFromPreset } from './data/presets';

const anyPresetVehicle = vehicleFromPreset(VEHICLE_PRESETS[0]);
const draftWith = (orderId: string) =>
  JSON.stringify({ vehicle: anyPresetVehicle, orders: [{ ...emptyOrder(1), orderId }] });

// test-setup.ts снимает привязку и чистит localStorage после каждого теста.
describe('App: черновик привязан к пользователю', () => {
  it('без привязки App показывает черновик из прежнего ключа', () => {
    localStorage.setItem('ladungsplaner.setup', draftWith('PUR-ORD-ANNA'));
    render(<App />);
    expect(screen.getByDisplayValue('PUR-ORD-ANNA')).toBeInTheDocument();
  });

  it('после привязки к Борису App не показывает черновик Анны', () => {
    localStorage.setItem('ladungsplaner.setup', draftWith('PUR-ORD-ANNA'));
    bindDraftsToUser('boris@firma.de');
    render(<App />);
    expect(screen.queryByDisplayValue('PUR-ORD-ANNA')).toBeNull();
  });

  it('после привязки к Борису App показывает его собственный черновик и пишет только под ним', () => {
    localStorage.setItem('ladungsplaner.u.anna%40firma.de.setup', draftWith('PUR-ORD-ANNA'));
    localStorage.setItem('ladungsplaner.u.boris%40firma.de.setup', draftWith('PUR-ORD-BORIS'));
    bindDraftsToUser('boris@firma.de');
    render(<App />);
    expect(screen.getByDisplayValue('PUR-ORD-BORIS')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('PUR-ORD-ANNA')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.setup')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.u.boris%40firma.de.setup')).toContain('PUR-ORD-BORIS');
  });
});
