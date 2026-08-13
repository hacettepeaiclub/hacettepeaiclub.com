"""add stakeholder table, multi-day events and manual ordering

Revision ID: c1a7f4b9d201
Revises: 06c305e0c5d6
Create Date: 2026-08-13 10:00:00.000000

NOT: Uygulama açılışta SQLModel.metadata.create_all() çalıştırdığı için,
konteyner bu göçten ÖNCE başlarsa "stakeholder" tablosu zaten oluşmuş olabilir.
Bu yüzden tüm işlemler "varsa atla" mantığıyla yazılmıştır; göç hangi sırada
çalışırsa çalışsın hata vermez ve tekrar çalıştırılabilir (idempotent).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'c1a7f4b9d201'
down_revision: Union[str, Sequence[str], None] = '06c305e0c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(table: str) -> bool:
    return table in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    if not _has_table(table):
        return False
    return column in {col["name"] for col in _inspector().get_columns(table)}


def upgrade() -> None:
    """Upgrade schema."""
    # 1. AI FEST Paydaş Toplulukları tablosu
    if not _has_table('stakeholder'):
        op.create_table(
            'stakeholder',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('logo_url', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('website_url', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.PrimaryKeyConstraint('id'),
        )

    # 2. Çok günlü etkinlikler için bitiş tarihi
    if not _has_column('event', 'end_date'):
        op.add_column('event', sa.Column('end_date', sa.DateTime(), nullable=True))

    # 3. Elle sıralama alanları
    if not _has_column('event', 'order_index'):
        op.add_column('event', sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'))

    if not _has_column('announcement', 'order_index'):
        op.add_column('announcement', sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    if _has_column('announcement', 'order_index'):
        op.drop_column('announcement', 'order_index')
    if _has_column('event', 'order_index'):
        op.drop_column('event', 'order_index')
    if _has_column('event', 'end_date'):
        op.drop_column('event', 'end_date')
    if _has_table('stakeholder'):
        op.drop_table('stakeholder')
