#!/usr/bin/env python3
"""Resolve vessel ownership for a list of IMO numbers using free/open sources.

Primary sources:
1) ShipInfo Agent API (open-source SDK/API integration; no API key supplied)
2) Wikidata SPARQL (free, unauthenticated)
3) Public International Group P&I club / ShipInfo pages discovered through DDG HTML

No MagicPort calls are made.
"""
from __future__ import annotations

import csv
import html
import json
import re
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable, Optional
from urllib.parse import urlparse, parse_qs

import requests
from bs4 import BeautifulSoup

SHIPINFO_API = "https://shipinfo.net/topos/api/v1/vessels/lookup"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
DDG_HTML = "https://html.duckduckgo.com/html/"

ALLOWED_DOMAINS = (
    "shipinfo.net", "gard.no", "skuld.com", "north-standard.com", "ukpandi.com",
    "britanniapandi.com", "steamshipmutual.com", "westpandi.com", "londonpandi.com",
    "american-club.com", "japanpandi.or.jp", "swedishclub.com", "shipownersclub.com",
    "igpandi.org", "war-sanctions.gur.gov.ua",
)

OWNER_KEY_RX = re.compile(
    r"^(registered[_ -]?owner|registered[_ -]?owners|registry[_ -]?owner|registry[_ -]?owners|"
    r"ship[_ -]?owner|shipowner|owner(?:s)?|ownership)$", re.I)
OWNER_LABEL_PATTERNS = [
    re.compile(r"Registered\s+owner\s*[:\-]\s*([^\n|<]{2,120})", re.I),
    re.compile(r"Ship\s+Owner\s*(?:\([^)]*\))?\s*[:\-]\s*([^\n|<]{2,120})", re.I),
    re.compile(r"P&I\s+Owners?.{0,80}?Owner\s*[:\-]\s*([^\n|<]{2,120})", re.I | re.S),
    re.compile(r"Owner\s*[:\-]\s*([^\n|<]{2,120})", re.I),
]
BAD_OWNER_VALUES = {"unknown", "n/a", "na", "none", "null", "-", "—", "not available", "private"}

@dataclass
class Result:
    vessel_name: str
    imo: str
    owner: str = ""
    owner_type: str = ""
    source_name: str = ""
    source_url: str = ""
    method: str = ""
    status: str = "Not found"
    notes: str = ""

class Lookup:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({
            "User-Agent": "CPC-Vessel-Owner-Research/1.0 (+https://github.com/dellmastercode2025/learn-002-stand)",
            "Accept-Language": "en-US,en;q=0.9",
        })

    @staticmethod
    def clean_owner(v: Any) -> str:
        if v is None: return ""
        if isinstance(v, dict):
            for k in ("name", "companyName", "company_name", "ownerName", "owner_name", "label", "value"):
                if k in v and v[k]: return Lookup.clean_owner(v[k])
            return ""
        if isinstance(v, list):
            vals=[]
            for x in v:
                c=Lookup.clean_owner(x)
                if c and c.lower() not in BAD_OWNER_VALUES and c not in vals: vals.append(c)
            return "; ".join(vals[:4])
        text=html.unescape(str(v)).strip(" \t\r\n:;,-–—")
        text=re.sub(r"\s+", " ", text)
        if not text or text.lower() in BAD_OWNER_VALUES: return ""
        return text[:180].rstrip()

    def _find_owner_in_json(self, obj: Any, path: str="") -> list[tuple[str,str]]:
        found=[]
        if isinstance(obj, dict):
            for k,v in obj.items():
                p=f"{path}.{k}" if path else k
                if OWNER_KEY_RX.match(str(k)):
                    c=self.clean_owner(v)
                    if c: found.append((p,c))
                found.extend(self._find_owner_in_json(v,p))
        elif isinstance(obj,list):
            for i,v in enumerate(obj): found.extend(self._find_owner_in_json(v,f"{path}[{i}]"))
        return found

    def shipinfo(self, imo: str) -> Optional[tuple[str,str,str]]:
        headers={"X-Agent-Name":"cpc-owner-lookup","X-Agent-Vendor":"dellmastercode2025","X-Agent-Session":f"imo-{imo}"}
        try:
            r=self.s.get(SHIPINFO_API, params={"id":f"IMO:{imo}"}, headers=headers, timeout=25)
            if r.status_code != 200: return None
            hits=self._find_owner_in_json(r.json())
            if not hits: return None
            hits.sort(key=lambda x: (0 if re.search(r"register",x[0],re.I) else 1, len(x[0])))
            path,owner=hits[0]
            return owner, ("Registered owner" if re.search(r"register",path,re.I) else "Owner"), r.url
        except Exception: return None

    def wikidata(self, imo: str) -> Optional[tuple[str,str,str]]:
        q=f'''SELECT ?ship ?shipLabel ?owner ?ownerLabel WHERE {{
          ?ship wdt:P458 "{imo}" . OPTIONAL {{ ?ship wdt:P127 ?owner . }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }} LIMIT 10'''
        try:
            r=self.s.get(WIKIDATA_SPARQL, params={"query":q,"format":"json"}, timeout=30,
                         headers={"Accept":"application/sparql-results+json"})
            if r.status_code!=200: return None
            bindings=r.json().get("results",{}).get("bindings",[]); owners=[]; ship_url=""
            for b in bindings:
                ship_url=b.get("ship",{}).get("value",ship_url)
                o=self.clean_owner(b.get("ownerLabel",{}).get("value",""))
                if o and o not in owners: owners.append(o)
            if owners: return "; ".join(owners), "Owner (Wikidata P127)", ship_url
        except Exception: pass
        return None

    @staticmethod
    def _unwrap_ddg(url: str) -> str:
        if "duckduckgo.com/l/" in url:
            try: return parse_qs(urlparse(url).query).get("uddg",[url])[0]
            except Exception: return url
        return url

    @staticmethod
    def allowed(url: str) -> bool:
        host=urlparse(url).netloc.lower()
        return any(host==d or host.endswith("."+d) for d in ALLOWED_DOMAINS)

    def ddg_results(self, query: str, max_results: int=8) -> Iterable[tuple[str,str,str]]:
        try:
            r=self.s.get(DDG_HTML, params={"q":query}, timeout=25,
                         headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123 Safari/537.36"})
            if r.status_code!=200: return []
            soup=BeautifulSoup(r.text,"html.parser"); out=[]
            for res in soup.select(".result"):
                a=res.select_one("a.result__a")
                if not a: continue
                url=self._unwrap_ddg(a.get("href", ""))
                if not self.allowed(url): continue
                sn=res.select_one(".result__snippet")
                out.append((url,a.get_text(" ",strip=True),sn.get_text(" ",strip=True) if sn else ""))
                if len(out)>=max_results: break
            return out
        except Exception: return []

    def extract_owner_text(self, text: str) -> str:
        if not text: return ""
        text=html.unescape(text)
        for pat in OWNER_LABEL_PATTERNS:
            m=pat.search(text)
            if m:
                val=self.clean_owner(m.group(1))
                val=re.split(r"\s{2,}|\b(?:IMO|MMSI|Flag|Manager|Operator|Class|Vessel)\s*[:\-]", val, maxsplit=1, flags=re.I)[0].strip()
                if 2<=len(val)<=140: return val
        return ""

    def public_pages(self, imo: str, vessel_name: str) -> Optional[tuple[str,str,str,str]]:
        for qi,q in enumerate((f'"{imo}" "Registered owner"', f'"{imo}" "Owner" vessel')):
            for url,title,snippet in self.ddg_results(q):
                owner=self.extract_owner_text(snippet)
                if owner:
                    typ="Registered owner" if re.search(r"registered owner",snippet,re.I) else "Owner as published"
                    return owner,typ,url,urlparse(url).netloc
                try:
                    rr=self.s.get(url,timeout=25,allow_redirects=True)
                    if rr.status_code!=200 or "text/html" not in rr.headers.get("content-type",""): continue
                    page=BeautifulSoup(rr.text,"html.parser").get_text("\n",strip=True)
                    if imo not in page: continue
                    owner=self.extract_owner_text(page)
                    if owner:
                        typ="Registered owner" if re.search(r"Registered\s+owner",page,re.I) else "Owner as published"
                        return owner,typ,rr.url,urlparse(rr.url).netloc
                except Exception: continue
            if qi==0: time.sleep(0.35)
        return None

    def lookup_one(self, name: str, imo: str) -> Result:
        res=Result(vessel_name=name,imo=imo)
        hit=self.shipinfo(imo)
        if hit:
            res.owner,res.owner_type,res.source_url=hit; res.source_name="ShipInfo API"; res.method="Free/open API"; res.status="Found"; return res
        hit=self.wikidata(imo)
        if hit:
            res.owner,res.owner_type,res.source_url=hit; res.source_name="Wikidata"; res.method="Free/open API"; res.status="Found"; return res
        hit=self.public_pages(imo,name)
        if hit:
            res.owner,res.owner_type,res.source_url,res.source_name=hit; res.method="Public registry/P&I webpage fallback"; res.status="Found"; return res
        res.notes="No owner returned by free API or approved public registry/P&I sources."
        return res

def main(inp: str="vessels.csv", out: str="owners.csv") -> int:
    with open(inp,encoding="utf-8-sig",newline="") as f: rows=list(csv.DictReader(f))
    lookup=Lookup(); results=[]
    for i,row in enumerate(rows,1):
        name=row["vessel_name"].strip(); imo=row["imo"].strip()
        print(f"[{i}/{len(rows)}] {name} IMO {imo}", flush=True)
        r=lookup.lookup_one(name,imo); print(f"  -> {r.owner or 'NOT FOUND'} [{r.source_name or '-'}]",flush=True)
        results.append(r); time.sleep(0.18 if r.status=="Found" else 0.45)
    fields=list(asdict(Result("","")).keys())
    with open(out,"w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); [w.writerow(asdict(r)) for r in results]
    found=sum(r.status=="Found" for r in results)
    Path("summary.json").write_text(json.dumps({"total":len(results),"found":found,"not_found":len(results)-found},indent=2),encoding="utf-8")
    return 0

if __name__ == "__main__": sys.exit(main(*(sys.argv[1:3])))
