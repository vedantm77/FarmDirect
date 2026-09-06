import os
from alembic import context
from app.database import Base
from app import entities

config = context.config
target_metadata = Base.metadata

def get_url():
    return os.getenv('DATABASE_URL', config.get_main_option('sqlalchemy.url', 'sqlite:///./farmdirect-demo.db'))

def run_migrations_offline():
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True
    )
    context.run_migrations()

def run_migrations_online():
    from sqlalchemy import create_engine
    url = get_url()
    connect_args = {'check_same_thread': False} if url.startswith('sqlite') else {}
    connectable = create_engine(url, connect_args=connect_args)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
