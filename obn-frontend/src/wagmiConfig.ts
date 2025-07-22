// wagmiConfig.ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'Olive Branch Network',
  projectId: '12b8b0b854636cdd02ae474ed0a3ee5b', // from WalletConnect Cloud
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(),
  },
});
