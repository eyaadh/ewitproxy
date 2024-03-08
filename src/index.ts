import {Hono} from 'hono'
import {cors} from 'hono/cors'
import CryptoJS from 'crypto-js'
import {env} from 'hono/adapter'

const app = new Hono()
const apiUrl = 'https://api.ewitypos.com/'
let headers = {
    'Authorization': '',
    'Content-Type': 'application/json'
}

app.use('*', cors({origin: ['http://localhost:5174']}))

app.use(async (ctx, next) => {
    try {
        const {SECRET_KEY} = env<{ SECRET_KEY: string }>(ctx, 'workerd')
        const {POS_API_KEY} = env<{ POS_API_KEY: string }>(ctx, 'workerd')
        headers.Authorization = POS_API_KEY


        const receivedSignature = ctx.req.raw.headers.get('x-signature')

        if (!receivedSignature) {
            return ctx.json({error: 'Invalid signature'}, 403)
        }

        const [receivedHmac, encryptedExpiration] = receivedSignature!.split('.')
        const timestamp = Date.now();
        const expiration = CryptoJS.AES.decrypt(encryptedExpiration, SECRET_KEY).toString(CryptoJS.enc.Utf8) // Decrypt expiration time

        if (timestamp > parseInt(expiration)) {
            return ctx.json({error: 'Signature expired'}, 403)
        }

        const dataToSign = ctx.req.url + encryptedExpiration
        const hmac = CryptoJS.HmacSHA256(dataToSign, SECRET_KEY)

        if (hmac.toString() !== receivedHmac) {
            return ctx.json({error: 'Invalid signature'}, 403)
        }

        await next()
    } catch (e) {
        console.error(e)
        return ctx.newResponse('Invalid signature', 403)
    }
})

app.get('/customers/:phoneNumber', async (ctx) => {
    const phoneNumber = ctx.req.param('phoneNumber')
    const response = await fetch(`${apiUrl}v1/customers?q_q=${phoneNumber}`, {
        headers: headers
    })
    const customer = await response.json()
    return ctx.json(customer)
})
app.post('/customers', async (ctx) => {
    const data = await ctx.req.json()
    const response = await fetch(`${apiUrl}v1/customers`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
    })
    const customer = await response.json()
    return ctx.json(customer)
})
app.get('/products/categories', async (ctx) => {
    const page = ctx.req.query('page') ? ctx.req.query('page') : '1'
    const response = await fetch(`${apiUrl}v1/products/categories?page=${page}`, {
        headers: headers
    })
    const categories = await response.json()
    return ctx.json(categories)
})
app.get('/products/locations/:locationId', async (ctx) => {
    const locationId = ctx.req.param('locationId')
    const page = ctx.req.query('page') ? ctx.req.query('page') : '1'
    const q_Category = ctx.req.query('q_Category') ? ctx.req.query('q_Category') : null
    const q_name = ctx.req.query('q_name') ? ctx.req.query('q_name') : null

    let url = `${apiUrl}v1/products/locations/${locationId}?q_name=${q_name}&page=${page}`
    if (q_Category) {
        url = `${apiUrl}v1/products/locations/${locationId}?q_Category=${q_Category}&page=${page}`
    }

    const response = await fetch(url, {
        headers: headers
    })
    const products = await response.json()
    return ctx.json(products)
})
app.get('/products/:itemId', async (ctx) => {
    const itemId = ctx.req.param('itemId')
    const response = await fetch(`${apiUrl}v1/products/${itemId}`, {
        headers: headers
    })
    const product = await response.json()
    return ctx.json(product)
})
app.get('/sales/bills/customer/:customerId', async (ctx) => {
    const customerId = ctx.req.param('customerId')
    const response = await fetch(`${apiUrl}v1/sales/bills/customer/${customerId}`, {
        headers: headers
    })
    const sales = await response.json()
    return ctx.json(sales)
})
app.get('/sales/bills/:billNumber', async (ctx) => {
    const billNumber = ctx.req.param('billNumber')
    const response = await fetch(`${apiUrl}v1/sales/bills/${billNumber}`, {
        headers: headers
    })
    const bill = await response.json()
    return ctx.json(bill)
})
app.post('/quotations', async (ctx) => {
    const data = await ctx.req.json()
    // 1. create a quotation
    const createQuoteResp = await fetch(`${apiUrl}v1/quotations`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            location_id: data.location_id,
            customer_id: data.customer_id
        })
    })
    // 2. gather the quotation number
    const quotation = await createQuoteResp.json() as any

    // 3. update the quotation with the lines
    const updateQuoteResp = await fetch(`${apiUrl}v1/quotations/${quotation.data.id}/lines`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            lines: data.lines
        })
    })

    const updatedQuotation = await updateQuoteResp.json()

    return ctx.json(updatedQuotation)
})

export default app