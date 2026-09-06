"""add sponsor categories, caption and category link

Revision ID: d2b8f1a93af0
Revises: c1a7f4b9d201
Create Date: 2026-09-06 00:00:00.000000

NOT: Uygulama açılışta SQLModel.metadata.create_all() çalıştırdığı için,
konteyner bu göçten ÖNCE başlarsa "sponsorcategory" tablosu zaten oluşmuş
olabilir. Bu yüzden tüm işlemler "varsa atla" mantığıyla yazılmıştır.

Mevcut sponsorlar (henüz bir kategorisi olmayanlar), sitede birden bire
kaybolmasınlar diye "Sponsorlarımız" adında varsayılan bir kategoriye
bağlanır. Admin panelinden dilendiği gibi yeniden adlandırılabilir,
silinebilir ya da yeni kategoriler eklenebilir.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'd2b8f1a93af0'
down_revision: Union[str, Sequence[str], None] = 'c1a7f4b9d201'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_CATEGORY_NAME = "Sponsorlarımız"


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(table: str) -> bool:
    return table in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    if not _has_table(table):
        return False
    return column in {col["name"] for col in _inspector().get_columns(table)}


def _has_fk(table: str, fk_name: str) -> bool:
    if not _has_table(table):
        return False
    return any(fk.get("name") == fk_name for fk in _inspector().get_foreign_keys(table))


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    # 1. Sponsor türlerini (kategorilerini) tutan tablo
    if not _has_table('sponsorcategory'):
        op.create_table(
            'sponsorcategory',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_sponsorcategory_name'), 'sponsorcategory', ['name'], unique=True)

    # 2. sponsor.caption: tür/seviye belirlenmese bile logonun altına yazılabilecek not
    if not _has_column('sponsor', 'caption'):
        op.add_column('sponsor', sa.Column('caption', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    # 3. sponsor.category_id: hangi türe/kategoriye ait olduğu
    if not _has_column('sponsor', 'category_id'):
        op.add_column('sponsor', sa.Column('category_id', sa.Integer(), nullable=True))

    if not _has_fk('sponsor', 'sponsor_category_id_fkey'):
        op.create_foreign_key(
            'sponsor_category_id_fkey', 'sponsor', 'sponsorcategory',
            ['category_id'], ['id'], ondelete='SET NULL',
        )

    # 4. "tier" artık serbest/opsiyonel bir "seviye" alanı; eskiden herkese
    #    otomatik atanmış olan "Standart" değeri artık site üzerinde rozet
    #    olarak gösterileceğinden, admin bilinçli olarak seçmediği sürece
    #    boş kalmalı.
    if _has_column('sponsor', 'tier'):
        bind.execute(sa.text("UPDATE sponsor SET tier = '' WHERE tier = 'Standart'"))

    # 5. Var olan sponsorları kaybetmemek için varsayılan bir kategoriye bağla
    if _has_table('sponsor') and _has_table('sponsorcategory'):
        existing = bind.execute(
            sa.text('SELECT id FROM sponsorcategory WHERE name = :name'),
            {"name": DEFAULT_CATEGORY_NAME},
        ).first()

        if existing:
            default_category_id = existing[0]
        else:
            result = bind.execute(
                sa.text(
                    'INSERT INTO sponsorcategory (name, order_index) VALUES (:name, 0) RETURNING id'
                ),
                {"name": DEFAULT_CATEGORY_NAME},
            )
            default_category_id = result.scalar_one()

        bind.execute(
            sa.text('UPDATE sponsor SET category_id = :cat_id WHERE category_id IS NULL'),
            {"cat_id": default_category_id},
        )


def downgrade() -> None:
    """Downgrade schema."""
    if _has_fk('sponsor', 'sponsor_category_id_fkey'):
        op.drop_constraint('sponsor_category_id_fkey', 'sponsor', type_='foreignkey')
    if _has_column('sponsor', 'category_id'):
        op.drop_column('sponsor', 'category_id')
    if _has_column('sponsor', 'caption'):
        op.drop_column('sponsor', 'caption')
    if _has_table('sponsorcategory'):
        op.drop_table('sponsorcategory')
