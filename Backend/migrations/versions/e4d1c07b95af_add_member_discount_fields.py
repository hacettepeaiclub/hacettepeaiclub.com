"""add member discount fields (sponsorcategory.is_discount, sponsor.discount)

Revision ID: e4d1c07b95af
Revises: d2b8f1a93af0
Create Date: 2026-09-27 00:00:00.000000

Anlaşmalı kafelerde üyelere kasada uygulanan indirimler için iki alan ekler:

  * sponsorcategory.is_discount — Bu kategori bir "indirim sponsorları"
    kategorisi mi? İşaretli kategorideki kurumlar, ana sayfadaki sponsor
    bölümünün yanı sıra "Üye İndirimleri" (indirimler.html) sayfasında da
    listelenir. İndirim sayfası bu sayede sponsor bölümüyle otomatik senkron
    kalır; ayrı bir tablo/liste tutulmaz.
  * sponsor.discount — Kuruma özel indirim (örn. "%15"). Serbest metindir.

NOT: Uygulama açılışta SQLModel.metadata.create_all() çalıştırdığı için,
konteyner bu göçten ÖNCE başlarsa sütunlar zaten oluşmuş olabilir. Bu yüzden
tüm işlemler "varsa atla" mantığıyla yazılmıştır.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'e4d1c07b95af'
down_revision: Union[str, Sequence[str], None] = 'd2b8f1a93af0'
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
    # 1. Kategori indirim kategorisi mi? Mevcut kategoriler için varsayılan: hayır.
    if not _has_column('sponsorcategory', 'is_discount'):
        op.add_column(
            'sponsorcategory',
            sa.Column('is_discount', sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    # 2. Kuruma özel indirim oranı (serbest metin, örn. "%15").
    if not _has_column('sponsor', 'discount'):
        op.add_column('sponsor', sa.Column('discount', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    if _has_column('sponsor', 'discount'):
        op.drop_column('sponsor', 'discount')
    if _has_column('sponsorcategory', 'is_discount'):
        op.drop_column('sponsorcategory', 'is_discount')
