"""add member table (indirim sayfasi uyelik dogrulamasi)

Revision ID: f7a2e51c38bd
Revises: e4d1c07b95af
Create Date: 2026-10-03 00:00:00.000000

Topluluk üye listesini tutar. Kayıtlar admin panelindeki "Üyeleri Güncelle"
ekranından Excel ile yüklenir; indirimler.html sayfasındaki doğrulama bu
tabloya bakar.

NOT: Uygulama açılışta SQLModel.metadata.create_all() çalıştırdığı için tablo
konteyner bu göçten önce başlarsa zaten oluşmuş olabilir. Bu yüzden işlemler
"varsa atla" mantığıyla yazılmıştır.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'f7a2e51c38bd'
down_revision: Union[str, Sequence[str], None] = 'e4d1c07b95af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(table: str) -> bool:
    return table in _inspector().get_table_names()


def _has_index(table: str, index_name: str) -> bool:
    if not _has_table(table):
        return False
    return any(ix.get("name") == index_name for ix in _inspector().get_indexes(table))


def upgrade() -> None:
    """Upgrade schema."""
    if not _has_table('member'):
        op.create_table(
            'member',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('nickname', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('full_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('faculty', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )

    if not _has_index('member', 'ix_member_nickname'):
        op.create_index(op.f('ix_member_nickname'), 'member', ['nickname'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    if _has_index('member', 'ix_member_nickname'):
        op.drop_index(op.f('ix_member_nickname'), table_name='member')
    if _has_table('member'):
        op.drop_table('member')
