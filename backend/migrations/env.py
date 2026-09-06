from alembic import context
from app.database import Base
from app import entities
config=context.config
target_metadata=Base.metadata
def run_migrations_offline(): context.configure(url=config.get_main_option('sqlalchemy.url'),target_metadata=target_metadata,literal_binds=True); context.run_migrations()
def run_migrations_online():
 from sqlalchemy import create_engine
 connectable=create_engine(config.get_main_option('sqlalchemy.url'))
 with connectable.connect() as connection: context.configure(connection=connection,target_metadata=target_metadata); context.run_migrations()
if context.is_offline_mode(): run_migrations_offline()
else: run_migrations_online()
