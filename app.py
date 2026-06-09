from flask import Flask, jsonify, request
import json
import os
import asyncio
import datetime
import threading
from planfix_api import fetch_planfix_fact

app = Flask(__name__, static_folder='static', static_url_path='')

DATA_CACHE = {
    "planfix_fact": None,
    "last_sync": None,
    "is_loading": False
}

def run_async(coro):
    """Безопасный запуск async-функции из синхронного Flask-роута."""
    result = {}
    def target():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result['value'] = loop.run_until_complete(coro)
        except Exception as e:
            result['error'] = e
        finally:
            loop.close()
    t = threading.Thread(target=target)
    t.start()
    t.join()
    if 'error' in result:
        raise result['error']
    return result['value']

def refresh_cache_background():
    """Обновляет кэш в фоновом потоке — не блокирует HTTP-запросы."""
    if DATA_CACHE["is_loading"]:
        return
    DATA_CACHE["is_loading"] = True
    def target():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            data = loop.run_until_complete(fetch_planfix_fact())
            loop.close()
            DATA_CACHE["planfix_fact"] = data
            DATA_CACHE["last_sync"] = datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")
            print(f"Cache refreshed at {DATA_CACHE['last_sync']}")
        except Exception as e:
            print(f"Background refresh failed: {e}")
        finally:
            DATA_CACHE["is_loading"] = False
    threading.Thread(target=target, daemon=True).start()

# Прогреть кэш при старте сервера
refresh_cache_background()

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

@app.route('/v2')
def serve_index_v2():
    return app.send_static_file('index2.html')

@app.route('/api/data')
def get_data():
    try:
        root_path = os.path.dirname(__file__)
        json_path = os.path.join(root_path, 'excel_structure.json')
        with open(json_path, 'r', encoding='utf-8') as f:
            excel_data = json.load(f)

        import math
        def sanitize_data(val):
            if isinstance(val, float) and math.isnan(val):
                return None
            elif isinstance(val, list):
                return [sanitize_data(v) for v in val]
            elif isinstance(val, dict):
                return {k: sanitize_data(v) for k, v in val.items()}
            return val

        sheet_data = sanitize_data(excel_data.get('Расчет объема по месяцам', []))

        # Если кэш ещё грузится — вернём пустой факт, но не подвесим браузер
        planfix_fact = DATA_CACHE["planfix_fact"] or {}
        last_sync = DATA_CACHE["last_sync"] or ("Загрузка..." if DATA_CACHE["is_loading"] else "Нет данных")

        response = {
            "excel_sheet": sheet_data,
            "planfix_fact": planfix_fact,
            "last_sync": last_sync,
            "is_loading": DATA_CACHE["is_loading"]
        }
        return jsonify(response)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/sync', methods=['POST'])
def sync_data():
    try:
        # Запускаем обновление в фоне и сразу отвечаем
        refresh_cache_background()
        return jsonify({
            "status": "success",
            "last_sync": DATA_CACHE["last_sync"] or "Обновление запущено...",
            "is_loading": True
        })
    except Exception as e:
        print(f"Sync failed: {e}")
        return jsonify({
            "status": "error",
            "error": "Не удалось запустить обновление."
        }), 200

@app.route('/api/status')
def get_status():
    """Фронтенд может поллить этот эндпоинт пока is_loading=True."""
    return jsonify({
        "is_loading": DATA_CACHE["is_loading"],
        "last_sync": DATA_CACHE["last_sync"]
    })

if __name__ == '__main__':
    app.run(debug=False, port=8000)
