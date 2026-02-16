import { query } from '@/lib/db';

export async function generateNextItemId(): Promise<string> {
    const result: any = await query('SELECT item_id FROM items WHERE item_id IS NOT NULL ORDER BY item_id DESC LIMIT 1');
    const lastIdRow = result[0];

    if (!lastIdRow || !lastIdRow.item_id) {
        return 'aaa';
    }

    const lastId = lastIdRow.item_id.toLowerCase();

    if (lastId.length !== 3) {
        return 'aaa';
    }

    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const idChars = lastId.split('');

    for (let i = 2; i >= 0; i--) {
        const charIndex = chars.indexOf(idChars[i]);
        if (charIndex === -1) {
            idChars[i] = 'a';
            continue;
        }

        if (charIndex < chars.length - 1) {
            idChars[i] = chars[charIndex + 1];
            for (let j = i + 1; j < 3; j++) {
                idChars[j] = 'a';
            }
            return idChars.join('');
        } else {
            idChars[i] = 'a';
        }
    }

    return 'aaa';
}

export async function generateItemHexId(): Promise<string> {
    // Pattern: A00-Z99
    const result: any = await query(`
    SELECT hex_id FROM items 
    WHERE hex_id IS NOT NULL AND CHAR_LENGTH(hex_id) = 3 
    AND hex_id REGEXP '^[A-Z][0-9][0-9]$'
    ORDER BY hex_id DESC LIMIT 1
  `);

    const lastRow = result[0];

    if (lastRow && lastRow.hex_id) {
        try {
            const lastId = lastRow.hex_id;
            let letter = lastId[0];
            let number = parseInt(lastId.substring(1));

            number++;
            if (number > 99) {
                number = 0;
                if (letter === 'Z') {
                    letter = 'A'; // Loop back or handle migration
                } else {
                    letter = String.fromCharCode(letter.charCodeAt(0) + 1);
                }
            }

            return `${letter}${number.toString().padStart(2, '0')}`;
        } catch (e) {
            // Fallback
        }
    }

    return 'A00';
}
