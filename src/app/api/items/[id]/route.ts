import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const id = params.id;
    try {
        const items: any = await query('SELECT * FROM items WHERE id = ?', [id]);
        if (items.length === 0) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }
        return NextResponse.json(items[0]);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const id = params.id;
    try {
        const body = await request.json();
        // Simplified update logic - update all fields or specific ones
        // We should build dynamic query based on body keys

        const keys = Object.keys(body).filter(k => k !== 'id');
        if (keys.length === 0) {
            return NextResponse.json({ message: 'No fields to update' });
        }

        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => {
            const val = body[k];
            if (typeof val === 'object' && val !== null) return JSON.stringify(val);
            return val;
        });

        // Add last_updated
        const now = new Date().toISOString();

        const sql = `UPDATE items SET ${setClause}, last_updated = ? WHERE id = ?`;
        await query(sql, [...values, now, id]);

        return NextResponse.json({ success: true, message: 'Item updated' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const id = params.id;
    try {
        await query('DELETE FROM items WHERE id = ?', [id]);
        return NextResponse.json({ success: true, message: 'Item deleted' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
