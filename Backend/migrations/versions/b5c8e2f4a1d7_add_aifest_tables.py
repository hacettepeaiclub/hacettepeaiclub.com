"""add AI FEST'26 tables (katilimci, oturum, yoklama, cekilis)

Revision ID: b5c8e2f4a1d7
Revises: f7a2e51c38bd
Create Date: 2026-10-24 00:00:00.000000

AI FEST'26 katılımcı listesi (Excel ile yüklenir), oturumlar, oturum yoklaması
ve sahne çekilişi kazananları. Rotalar: routers/aifest.py

NOT: Uygulama açılışta SQLModel.metadata.create_all() çalıştırdığı için tablolar
konteyner bu göçten önce başlarsa zaten oluşmuş olabilir. Bu yüzden işlemler
"varsa atla" mantığıyla yazılmıştır.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'b5c8e2f4a1d7'
down_revision: Union[str, Sequence[str], None] = 'f7a2e51c38bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STR = sqlmodel.sql.sqltypes.AutoString


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(table: str) -> bool:
    return table in _inspector().get_table_names()


def _has_index(table: str, index_name: str) -> bool:
    if not _has_table(table):
        return False
    return any(ix.get("name") == index_name for ix in _inspector().get_indexes(table))


def _create_index(name: str, table: str, columns: list, unique: bool = False) -> None:
    if not _has_index(table, name):
        op.create_index(name, table, columns, unique=unique)


def upgrade() -> None:
    """Upgrade schema."""
    if not _has_table('fest_participant'):
        op.create_table(
            'fest_participant',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('id_hash', STR(), nullable=False),
            sa.Column('id_tail', STR(), nullable=False),
            sa.Column('full_name', STR(), nullable=False),
            sa.Column('email', STR(), nullable=True),
            sa.Column('phone_last4', STR(), nullable=False),
            sa.Column('participant_type', STR(), nullable=True),
            sa.Column('status', STR(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
    _create_index('ix_fest_participant_id_hash', 'fest_participant', ['id_hash'], unique=True)

    if not _has_table('fest_session'):
        op.create_table(
            'fest_session',
            sa.Column('id', STR(), nullable=False),
            sa.Column('title', STR(), nullable=False),
            sa.Column('starts_at', sa.DateTime(), nullable=False),
            sa.Column('ends_at', sa.DateTime(), nullable=False),
            sa.Column('code', STR(), nullable=False),
            sa.Column('mode', STR(), nullable=False, server_default='auto'),
            sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
        )

    if not _has_table('fest_checkin'):
        op.create_table(
            'fest_checkin',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('session_id', STR(), nullable=False),
            sa.Column('participant_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['session_id'], ['fest_session.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['participant_id'], ['fest_participant.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('session_id', 'participant_id', name='uq_fest_checkin_session_participant'),
        )
    _create_index('ix_fest_checkin_session_id', 'fest_checkin', ['session_id'])
    _create_index('ix_fest_checkin_participant_id', 'fest_checkin', ['participant_id'])

    if not _has_table('fest_raffle_winner'):
        op.create_table(
            'fest_raffle_winner',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('session_id', STR(), nullable=False),
            sa.Column('participant_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('is_void', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.ForeignKeyConstraint(['session_id'], ['fest_session.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['participant_id'], ['fest_participant.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
    _create_index('ix_fest_raffle_winner_session_id', 'fest_raffle_winner', ['session_id'])


def downgrade() -> None:
    """Downgrade schema."""
    for table in ('fest_raffle_winner', 'fest_checkin', 'fest_session', 'fest_participant'):
        if _has_table(table):
            op.drop_table(table)
