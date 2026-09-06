import os, jwt
from datetime import datetime,timedelta,timezone
from fastapi import Depends,HTTPException,status
from fastapi.security import HTTPAuthorizationCredentials,HTTPBearer
from passlib.context import CryptContext

pwd=CryptContext(schemes=['bcrypt'],deprecated='auto'); bearer=HTTPBearer(); SECRET=os.getenv('JWT_SECRET','farmdirect-demo-secret-change-me'); ALG='HS256'
def hash_password(value:str)->str: return pwd.hash(value)
def verify_password(value:str,hashed:str)->bool: return pwd.verify(value,hashed)
def token(user_id:str,role:str)->str: return jwt.encode({'sub':user_id,'role':role,'exp':datetime.now(timezone.utc)+timedelta(hours=8)},SECRET,algorithm=ALG)
def current(credentials:HTTPAuthorizationCredentials=Depends(bearer)):
  try:return jwt.decode(credentials.credentials,SECRET,algorithms=[ALG])
  except jwt.PyJWTError: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail='Invalid or expired session')
def role_guard(*roles):
  def guard(payload=Depends(current)):
    if payload['role'] not in roles: raise HTTPException(status_code=403,detail='This role cannot access this resource')
    return payload
  return guard
