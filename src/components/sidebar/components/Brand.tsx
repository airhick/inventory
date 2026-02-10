// Chakra imports
import { Flex, Image, useColorModeValue } from '@chakra-ui/react';

// Custom components
import { HSeparator } from 'components/separator/Separator';

export function SidebarBrand() {
	return (
		<Flex alignItems='center' flexDirection='column'>
			<Image
				src='/img/logo-globalvision.png'
				alt='GlobalVision Communication'
				maxH='60px'
				my='32px'
				objectFit='contain'
			/>
			<HSeparator mb='20px' />
		</Flex>
	);
}

export default SidebarBrand;
