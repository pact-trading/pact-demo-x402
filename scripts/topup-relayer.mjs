// Top up Sightline's relayer from a funded key (testnet only).
//   node scripts/topup-relayer.mjs <funder-env-file> [wbt] [usdt]     (no amounts: just print balances)
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, formatEther, formatUnits, http, parseAbi, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const env = f => Object.fromEntries(readFileSync(f, 'utf8').split('\n').map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const chain = defineChain({ id: 1874, name: 'Whitechain Sepolia', nativeCurrency: { name: 'WBT', symbol: 'WBT', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.testnet.whitechain.io'] } } });
const USDT = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7';
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)']);
const [funderFile, wbt, usdt] = process.argv.slice(2);
const funderKeys = env(funderFile);
const funder = privateKeyToAccount(funderKeys.DEPLOYER_PRIVATE_KEY ?? funderKeys.PRIVATE_KEY);
const relayer = privateKeyToAccount(env(new URL('../.env.local', import.meta.url)).SIGHTLINE_RELAYER_KEY).address;
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account: funder, chain, transport: http() });
const show = async (label, a) => console.log(label.padEnd(8), a, formatEther(await pub.getBalance({ address: a })), 'WBT', formatUnits(await pub.readContract({ address: USDT, abi: erc20, functionName: 'balanceOf', args: [a] }), 6), 'USDT');

await show('funder', funder.address); await show('relayer', relayer);
if (wbt && Number(wbt) > 0) { const h = await wallet.sendTransaction({ to: relayer, value: parseEther(wbt) }); await pub.waitForTransactionReceipt({ hash: h }); console.log(`sent ${wbt} WBT ${h}`); }
if (usdt && Number(usdt) > 0) { const h = await wallet.writeContract({ address: USDT, abi: erc20, functionName: 'transfer', args: [relayer, BigInt(Math.round(Number(usdt) * 1e6))] }); await pub.waitForTransactionReceipt({ hash: h }); console.log(`sent ${usdt} USDT ${h}`); }
if (wbt || usdt) await show('relayer', relayer);
