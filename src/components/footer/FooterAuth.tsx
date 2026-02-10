/* eslint-disable */

import {
  Flex,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';

export default function Footer(props: { [x: string]: any }) {
  let textColor = useColorModeValue('gray.400', 'white');
  return (
    <Flex
      zIndex="3"
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      px={{ base: '30px', md: '0px' }}
      pb="30px"
      {...props}
    >
      <Text
        color={textColor}
        textAlign="center"
        fontSize="sm"
      >
        &copy; {new Date().getFullYear()} Code Bar CRM
      </Text>
    </Flex>
  );
}
