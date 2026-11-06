'use client';

import type { Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bootstrapTypedData, sessionTypedData, type BootstrapMessage, type SessionMessage } from '@/lib/chain';
import { newKey, post, saveDesk, type Desk } from './vault';

/**
 * One click: an owner key and a session key made in this browser, the vault deployed by Sightline's
 * relayer, and the one-time 2 test USDT. Used by the chat so nobody has to open the desk page first.
 */
export async function quickStartDesk(onStep: (step: string) => void, limits = { perCallMinor: '100000', dailyMinor: '5000000' }): Promise<Desk> {
  const ownerKey = newKey(), sessionKey = newKey();
  const owner = privateKeyToAccount(ownerKey);
  onStep('Signing your spending limits');
  const p = await post<{ pendingId: string; account: Address; session: SessionMessage; bootstrap: BootstrapMessage }>('/api/vault/prepare', {
    owner: owner.address, sessionKey: privateKeyToAccount(sessionKey).address, ...limits, label: 'Chat desk',
  });
  const signatures = [
    await owner.signTypedData(sessionTypedData(p.account, p.session) as never),
    await owner.signTypedData(bootstrapTypedData(p.account, p.bootstrap) as never),
  ];
  onStep('Opening your desk on Whitechain');
  await post('/api/vault/create', { pendingId: p.pendingId, signatures });
  const desk: Desk = { account: p.account, sessionKey, ownerKey, owner: owner.address, label: 'Chat desk' };
  saveDesk(desk);
  onStep('Adding 2 test USDT');
  await post(`/api/vault/${p.account}/faucet`, {}).catch(() => undefined);
  window.dispatchEvent(new Event('sightline:refresh'));
  return desk;
}
