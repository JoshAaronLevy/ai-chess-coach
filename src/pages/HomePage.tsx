import { useNavigate } from 'react-router-dom';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';

export function HomePage() {
  const navigate = useNavigate();

  const handleStartGame = () => {
    navigate('/play');
  };

  const cardHeader = (
    <div className="text-center p-4">
      <i className="pi pi-chess-king text-6xl text-primary mb-3"></i>
    </div>
  );

  const cardContent = (
    <div className="text-center">
      <p className="text-xl text-600 mb-4 line-height-3">
        This is an MVP scaffold of an AI-powered chess coaching application. 
        Experience interactive chess gameplay enhanced with intelligent coaching features 
        designed to help you improve your game.
      </p>
      
      <p className="text-lg text-700 mb-5 line-height-3">
        Features include a fully playable chess board with real-time AI analysis, 
        move suggestions, and personalized coaching insights. Whether you're a beginner 
        learning the basics or an experienced player looking to refine your strategy, 
        our AI coach is here to guide your journey.
      </p>

      <Button
        label="Start Local Game"
        icon="pi pi-play"
        onClick={handleStartGame}
        className="p-button-lg p-button-primary"
        size="large"
      />
    </div>
  );

  return (
    <div className="flex justify-content-center align-items-center min-h-screen p-4">
      <div className="w-full max-w-4xl">
        <Card
          header={cardHeader}
          className="shadow-4 border-round-lg"
        >
          {cardContent}
        </Card>
      </div>
    </div>
  );
}