import { Card } from 'primereact/card';

export function InfoModalContent() {
  const cardHeader = (
    <div className="text-center p-4">
      <i className="pi pi-chess-king text-6xl text-primary mb-3"></i>
      <h1 className="text-4xl font-bold m-0 text-900">Welcome to AI Chess Coach</h1>
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
    </div>
  );

  return (
    <div className="flex justify-content-center">
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