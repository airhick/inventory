import { Icon } from '@chakra-ui/react';
import {
  MdBarChart,
  MdPerson,
  MdHome,
  MdLock,
  MdOutlineShoppingCart,
  MdQrCodeScanner,
  MdInventory,
  MdPhotoLibrary,
  MdLocationOn,
  MdMic,
} from 'react-icons/md';

import { IRoute } from 'types/navigation';

const routes: IRoute[] = [
  {
    name: 'Scanner',
    layout: '/admin',
    path: '/scanner',
    icon: <Icon as={MdQrCodeScanner} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Inventaire',
    layout: '/admin',
    path: '/inventory',
    icon: <Icon as={MdInventory} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Galerie',
    layout: '/admin',
    path: '/gallery',
    icon: <Icon as={MdPhotoLibrary} width="20px" height="20px" color="inherit" />,
    secondary: true,
  },
  {
    name: 'Locations',
    layout: '/admin',
    path: '/location',
    icon: <Icon as={MdLocationOn} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Commande Vocale',
    layout: '/admin',
    path: '/voice-command',
    icon: <Icon as={MdMic} width="20px" height="20px" color="inherit" />,
  },
];

export default routes;
