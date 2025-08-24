import subprocess, sys
import pytest

@pytest.fixture(scope="session", autouse=True)
def build_site():
    subprocess.run([sys.executable, 'tools/build.py'], check=True)
