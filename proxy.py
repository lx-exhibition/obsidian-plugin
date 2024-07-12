from fastapi import FastAPI, Request
from requests import get
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def proxy_request(url: str):
	res = get(url)
	print(res.headers.get('content-type'))
	try:
		return Response(content=res.content, media_type=res.headers['content-type'])
	except:
		return Response('')

