"""add stakeholder table, multi-day events and manual ordering

Revision ID: c1a7f4b9d201
Revises: 06c305e0c5d6
Create Date: 2026-08-13 10:00:00.000000

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


def upgrade() -> None:
    """Upgrade schema."""
    # AI FEST Paydaş Toplulukları tablosu
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

    # Çok günlü etkinlikler için bitiş tarihi
    op.add_column('event', sa.Column('end_date', sa.DateTime(), nullable=True))

    # Elle sıralama alanları
    op.add_column('event', sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('announcement', sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('announcement', 'order_index')
    op.drop_column('event', 'order_index')
    op.drop_column('event', 'end_date')
    op.drop_table('stakeholder')
