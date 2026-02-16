import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateNextItemId, generateItemHexId } from '@/lib/item-utils';

export async function GET(request: NextRequest) {
    try {
        const items = await query('SELECT * FROM items ORDER BY id DESC');
        return NextResponse.json(items);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            name,
            serial_number,
            quantity,
            category,
            category_details,
            image,
            scanned_code,
            details,
            status,
            item_type,
            brand,
            model,
            rental_end_date,
            current_rental_id,
            custom_data,
            parent_id,
            display_order
        } = body;

        const now = new Date().toISOString();

        // Generate IDs if not provided
        const finalItemId = body.item_id || await generateNextItemId();
        const finalHexId = body.hex_id || await generateItemHexId();

        const sql = `
      INSERT INTO items (
        item_id, hex_id, name, serial_number, quantity, category, category_details, image, scanned_code, 
        created_at, last_updated, details, status, item_type, brand, model, 
        rental_end_date, current_rental_id, custom_data, parent_id, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const params = [
            finalItemId, finalHexId, name, serial_number, quantity || 1, category, category_details, image, scanned_code,
            now, now, details, status, item_type, brand, model,
            rental_end_date, current_rental_id, custom_data ? JSON.stringify(custom_data) : null, parent_id, display_order
        ];


        const result: any = await query(sql, params);

        return NextResponse.json({
            success: true,
            id: result.insertId,
            message: 'Item created successfully'
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
