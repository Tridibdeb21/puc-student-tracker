# Deploying to Render

## Quick Start

1. **Push to GitHub** (if not already done)
   ```bash
   git push origin main
   ```

2. **Create a Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

3. **Connect Your Repository**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the `puc-student-tracker` repository

4. **Configure the Service**
   - **Name:** cf-student-tracker
   - **Environment:** Node
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && npm start`
   - **Plan:** Free (or paid if you need better specs)

5. **Add Environment Variables**
   - Add the following environment variables in the "Environment" section:
     - `JUDGE0_API_KEY`: Your Judge0 API key
     - `CF_API_KEY`: Your CodeForces API key
     - `CF_SECRET`: Your CodeForces secret

6. **Deploy**
   - Click "Create Web Service"
   - Render will automatically build and deploy

## Important Notes

- Your backend is already configured to use `process.env.PORT`, which Render provides
- The frontend is served from the backend via the static middleware
- The build command installs dependencies in the backend folder only
- Free tier has limitations (sleeps after 15 mins of inactivity), upgrade if needed

## Environment Variables

All sensitive information from your `.env` file should be added as environment variables in Render:
- `JUDGE0_API_KEY`
- `CF_API_KEY`
- `CF_SECRET`

Never commit `.env` files to GitHub. Use `.env.example` for reference.

## Troubleshooting

- Check the Render logs if deployment fails
- Ensure all environment variables are set correctly
- Verify the GitHub repository is connected and has the latest code
- Check that `backend/package.json` has the correct `start` script
