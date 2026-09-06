def test_demo_credentials_are_documented():
    email='buyer@farmdirect.demo'
    password='FarmDirect2026!'
    assert email.endswith('@farmdirect.demo')
    assert len(password)>=12
